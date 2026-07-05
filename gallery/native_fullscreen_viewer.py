#!/usr/bin/env python3
"""Tiny macOS fullscreen image viewer for the gallery's Orca mode.

This deliberately avoids Electron/WebKit fullscreen. It owns one native
borderless AppKit window and exits by destroying that window/process.
"""
import argparse
import atexit
import os
import shutil
import subprocess
import sys
import tempfile

import objc
from AppKit import (
    NSApplication,
    NSApplicationActivationPolicyAccessory,
    NSApplicationPresentationHideDock,
    NSApplicationPresentationHideMenuBar,
    NSBackingStoreBuffered,
    NSBorderlessWindowMask,
    NSColor,
    NSImage,
    NSImageScaleProportionallyUpOrDown,
    NSImageView,
    NSMakeRect,
    NSScreen,
    NSScreenSaverWindowLevel,
    NSView,
    NSWindow,
)
from PIL import Image


TEMP_PATHS = []
DEFAULT_IMAGE_MARGIN = 200


def cleanup():
    for path in TEMP_PATHS:
        try:
            os.remove(path)
        except OSError:
            pass


atexit.register(cleanup)


class ExitWindow(NSWindow):
    def canBecomeKeyWindow(self):
        return True

    def canBecomeMainWindow(self):
        return True

    def keyDown_(self, event):
        chars = (event.charactersIgnoringModifiers() or "").lower()
        if event.keyCode() == 53 or chars in ("q", "f", " "):
            NSApplication.sharedApplication().terminate_(None)
            return
        objc.super(ExitWindow, self).keyDown_(event)


class ExitImageView(NSImageView):
    def acceptsFirstResponder(self):
        return True

    @objc.python_method
    def configureViewport(self, base_frame, root_frame):
        self.baseFrame = base_frame
        self.rootFrame = root_frame
        self.zoom = 1.0
        self.dragLast = None

    @objc.python_method
    def _clamp(self, value, lower, upper):
        return max(lower, min(upper, value))

    @objc.python_method
    def _clampedFrame(self, x, y, width, height):
        base = self.baseFrame
        root = self.rootFrame

        if width <= root.size.width:
            min_x = base.origin.x + min(0.0, base.size.width - width) / 2.0
            max_x = base.origin.x + max(0.0, base.size.width - width) / 2.0
        else:
            min_x = root.origin.x + root.size.width - width
            max_x = root.origin.x

        if height <= root.size.height:
            min_y = base.origin.y + min(0.0, base.size.height - height) / 2.0
            max_y = base.origin.y + max(0.0, base.size.height - height) / 2.0
        else:
            min_y = root.origin.y + root.size.height - height
            max_y = root.origin.y

        return NSMakeRect(self._clamp(x, min_x, max_x), self._clamp(y, min_y, max_y), width, height)

    @objc.python_method
    def _applyZoomAtPoint(self, point, factor):
        base = self.baseFrame
        old = self.frame()
        self.zoom = self._clamp(self.zoom * factor, 0.35, 6.0)
        if abs(self.zoom - 1.0) < 0.03:
            self.zoom = 1.0
            self.setFrame_(base)
            return

        width = base.size.width * self.zoom
        height = base.size.height * self.zoom
        px = 0.5 if old.size.width <= 0 else (point.x - old.origin.x) / old.size.width
        py = 0.5 if old.size.height <= 0 else (point.y - old.origin.y) / old.size.height
        frame = self._clampedFrame(point.x - px * width, point.y - py * height, width, height)
        self.setFrame_(frame)

    def scrollWheel_(self, event):
        delta = event.scrollingDeltaY()
        if abs(delta) < 0.01:
            delta = event.deltaY()
        if abs(delta) < 0.01:
            return
        step = self._clamp(delta / 6.0 if abs(delta) > 1.0 else delta, -4.0, 4.0)
        point = self.superview().convertPoint_fromView_(event.locationInWindow(), None)
        self._applyZoomAtPoint(point, pow(1.12, step))

    def magnifyWithEvent_(self, event):
        point = self.superview().convertPoint_fromView_(event.locationInWindow(), None)
        self._applyZoomAtPoint(point, 1.0 + event.magnification())

    def mouseDown_(self, event):
        if event.clickCount() >= 2:
            NSApplication.sharedApplication().terminate_(None)
            return
        self.dragLast = self.superview().convertPoint_fromView_(event.locationInWindow(), None)

    def mouseDragged_(self, event):
        if self.dragLast is None:
            return
        point = self.superview().convertPoint_fromView_(event.locationInWindow(), None)
        old = self.frame()
        frame = self._clampedFrame(
            old.origin.x + point.x - self.dragLast.x,
            old.origin.y + point.y - self.dragLast.y,
            old.size.width,
            old.size.height,
        )
        self.setFrame_(frame)
        self.dragLast = point

    def mouseUp_(self, event):
        self.dragLast = None

    def rightMouseDown_(self, event):
        NSApplication.sharedApplication().terminate_(None)


def temp_png_path():
    fd, path = tempfile.mkstemp(prefix="cmux-gallery-fullscreen-", suffix=".png")
    os.close(fd)
    TEMP_PATHS.append(path)
    return path


def screen_pixel_limit():
    screen = NSScreen.mainScreen()
    if screen is None:
        return 4096, 4096
    frame = safe_content_rect(screen)
    scale = float(screen.backingScaleFactor() or 1.0)
    return max(1, int(frame.size.width * scale)), max(1, int(frame.size.height * scale))


def safe_content_rect(screen):
    """Image area inside the native fullscreen window, excluding notch/menu zones."""
    frame = screen.frame()
    visible = screen.visibleFrame()
    margin = DEFAULT_IMAGE_MARGIN
    try:
        margin = max(0, int(os.environ.get("CMUX_GALLERY_FULLSCREEN_MARGIN", DEFAULT_IMAGE_MARGIN)))
    except ValueError:
        margin = DEFAULT_IMAGE_MARGIN

    left = max(0.0, visible.origin.x - frame.origin.x)
    bottom = max(0.0, visible.origin.y - frame.origin.y)
    right = max(0.0, (frame.origin.x + frame.size.width) - (visible.origin.x + visible.size.width))
    top = max(0.0, (frame.origin.y + frame.size.height) - (visible.origin.y + visible.size.height))

    if hasattr(screen, "safeAreaInsets"):
        insets = screen.safeAreaInsets()
        left = max(left, float(insets.left))
        right = max(right, float(insets.right))
        top = max(top, float(insets.top))
        bottom = max(bottom, float(insets.bottom))

    x = left + margin
    y = bottom + margin
    width = max(100.0, frame.size.width - left - right - 2 * margin)
    height = max(100.0, frame.size.height - top - bottom - 2 * margin)
    return NSMakeRect(x, y, width, height)


def raster_to_png(src, max_w, max_h):
    out = temp_png_path()
    img = Image.open(src)
    try:
        img.seek(0)
    except EOFError:
        pass
    img.load()
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    img.save(out, "PNG")
    return out


def svg_to_png(src, max_w, max_h):
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        raise RuntimeError("rsvg-convert not found")
    out = temp_png_path()
    subprocess.run(
        [rsvg, "-a", "-w", str(max_w), "-h", str(max_h), "-f", "png", "-o", out, src],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=30,
    )
    return out


def displayable_image(src):
    max_w, max_h = screen_pixel_limit()
    ext = os.path.splitext(src)[1].lower()
    if ext == ".svg":
        return svg_to_png(src, max_w, max_h)
    return raster_to_png(src, max_w, max_h)


def run_viewer(src):
    display_path = displayable_image(src)
    app = NSApplication.sharedApplication()
    app.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
    app.setPresentationOptions_(NSApplicationPresentationHideDock | NSApplicationPresentationHideMenuBar)

    screen = NSScreen.mainScreen()
    frame = screen.frame()
    image = NSImage.alloc().initWithContentsOfFile_(display_path)
    if image is None:
        raise RuntimeError("failed to load image")

    window = ExitWindow.alloc().initWithContentRect_styleMask_backing_defer_(
        frame, NSBorderlessWindowMask, NSBackingStoreBuffered, False
    )
    window.setReleasedWhenClosed_(False)
    window.setBackgroundColor_(NSColor.blackColor())
    window.setOpaque_(True)
    window.setLevel_(NSScreenSaverWindowLevel)

    root_frame = NSMakeRect(0, 0, frame.size.width, frame.size.height)
    root = NSView.alloc().initWithFrame_(root_frame)
    content_frame = safe_content_rect(screen)
    view = ExitImageView.alloc().initWithFrame_(content_frame)
    view.configureViewport(content_frame, root_frame)
    view.setImage_(image)
    view.setImageScaling_(NSImageScaleProportionallyUpOrDown)
    view.setEditable_(False)
    view.setAnimates_(True)
    view.setBackgroundColor_(NSColor.blackColor())
    root.addSubview_(view)
    window.setContentView_(root)

    window.makeKeyAndOrderFront_(None)
    window.orderFrontRegardless()
    app.activateIgnoringOtherApps_(True)
    window.makeFirstResponder_(view)
    app.run()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    src = os.path.realpath(args.image)
    if not os.path.isfile(src):
        raise SystemExit("image not found")
    if args.check:
        path = displayable_image(src)
        print(path)
        return
    run_viewer(src)


if __name__ == "__main__":
    main()
