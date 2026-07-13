#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "media"
OUT.mkdir(parents=True, exist_ok=True)
WEB_OUT = ROOT / "website" / "public"
WEB_OUT.mkdir(parents=True, exist_ok=True)
BASELINES = ROOT / "docs" / "ui" / "baseline"

W, H = 1600, 1000
BG = "#20242a"
SIDE = "#171a1f"
PANEL = "#262b31"
PANEL2 = "#2d333b"
BORDER = "#3b434f"
TEXT = "#e8eaed"
TEXT2 = "#c9ced7"
MUTED = "#858e9b"
MUTED2 = "#626c7a"
ACCENT = "#e8823a"
BLUE = "#79a7ff"
GREEN = "#98c379"


def font(size: int, bold: bool = False, candidates: list[str] | None = None) -> ImageFont.FreeTypeFont:
    candidates = candidates or [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size=size)
        except Exception:
            pass
    return ImageFont.load_default()


F10 = font(10)
F12 = font(12)
F13 = font(13)
F14 = font(14)
F15 = font(15)
F16 = font(16)
F17 = font(17)
F18 = font(18)
F20 = font(20)
F22 = font(22)
F24 = font(24)
F28 = font(28)
F40 = font(40)
F52_DISPLAY = font(
    52,
    candidates=[
        "/System/Library/Fonts/NewYorkItalic.ttf",
        "/System/Library/Fonts/Supplemental/Didot.ttc",
        "/System/Library/Fonts/Avenir Next.ttc",
    ],
)
F96_DISPLAY = font(
    96,
    candidates=[
        "/System/Library/Fonts/NewYork.ttf",
        "/System/Library/Fonts/Supplemental/Didot.ttc",
        "/System/Library/Fonts/Avenir Next.ttc",
    ],
)


def centered(draw, xy, s, fill=TEXT2, f=F16):
    draw.text(xy, s, fill=fill, font=f, anchor="mm")


def rr(draw: ImageDraw.ImageDraw, box, radius=10, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, s, fill=TEXT2, f=F16, anchor=None):
    draw.text(xy, s, fill=fill, font=f, anchor=anchor)


def dot(draw, x, y, c):
    draw.ellipse((x, y, x + 18, y + 18), fill=c)


def load_baseline(name: str) -> Image.Image:
    path = BASELINES / name
    if not path.is_file():
        raise FileNotFoundError(f"README baseline missing: {path}")
    return Image.open(path).convert("RGB")


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def draw_banner() -> Image.Image:
    """Editorial hero built from the real product, not a synthetic mockup."""
    img = Image.new("RGB", (1600, 720), "#0d1015")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 510, 720), fill="#12161c")
    d.line((510, 0, 510, 720), fill="#29303a", width=1)

    text(d, (64, 70), "AGENTIC RESEARCH ENVIRONMENT", "#8f99a7", F15)
    text(d, (62, 136), "Atelier", TEXT, F96_DISPLAY)
    text(d, (68, 254), "Research moves", "#f0f2f5", F52_DISPLAY)
    text(d, (68, 314), "when context stays.", "#f0f2f5", F52_DISPLAY)

    copy = [
        "Ask agents.",
        "Organize evidence.",
        "Inspect figures.",
        "Advance the project.",
    ]
    y = 410
    for index, line in enumerate(copy):
        d.ellipse((68, y + 8, 78, y + 18), fill=ACCENT if index == 3 else "#4b5664")
        text(d, (96, y), line, TEXT2 if index < 3 else TEXT, F22)
        y += 46
    d.line((68, 628, 436, 628), fill=ACCENT, width=3)
    d.line((68, 636, 326, 636), fill="#667181", width=1)

    product = load_baseline("1512x883-dark-split-thread-actif.png")
    product = cover(product, (1020, 596))
    # A quiet shadow step separates the real app from the editorial canvas.
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((544, 76, 1580, 688), radius=22, fill=(0, 0, 0, 145))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
    img.paste(product, (554, 86))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((553, 85, 1575, 683), radius=16, outline="#3a424e", width=2)
    return img


def draw_window() -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Chrome
    d.rectangle((0, 0, W, 52), fill="#1b1e24")
    dot(d, 22, 18, "#ff5f57")
    dot(d, 54, 18, "#ffbd2e")
    dot(d, 86, 18, "#28c840")
    text(d, (130, 20), "Atelier", TEXT2, F18)

    # Sidebar
    d.rectangle((0, 52, 300, H), fill=SIDE)
    d.line((300, 52, 300, H), fill="#2b3038", width=2)
    actions = [("✎", "New chat"), ("⌕", "Search"), ("⇩", "Resume session")]
    y = 116
    for icon, label in actions:
        text(d, (28, y), icon, MUTED, F18)
        text(d, (58, y), label, TEXT2, F17)
        y += 44
    text(d, (28, 272), "▾  PROJECTS", MUTED, F12)
    projects = [
        ("atelier-studio", BLUE, True),
        ("Climate paper", ACCENT, False),
        ("Model registry", GREEN, False),
    ]
    y = 320
    for name, color, active in projects:
        if active:
            rr(d, (20, y - 10, 280, y + 28), 8, fill="#222832")
        d.rectangle((42, y + 2, 54, y + 14), outline=color, width=2)
        text(d, (72, y - 2), name, TEXT2 if active else MUTED, F16)
        y += 42
    text(d, (28, 510), "▾  CHATS", MUTED, F12)
    chats = [
        ("Smoke Impact on Glacier Melt", "claude"),
        ("Forest fire aerosol notes", "codex"),
        ("Session 019f33d1", "claude"),
        ("Release checklist", "codex"),
    ]
    y = 556
    for i, (title, provider) in enumerate(chats):
        if i == 1:
            rr(d, (20, y - 12, 280, y + 28), 8, fill="#2b313b")
        text(d, (36, y - 2), "✱" if provider == "codex" else "◎", ACCENT if provider == "codex" else MUTED, F15)
        text(d, (62, y - 4), title, TEXT2 if i == 1 else MUTED, F15)
        y += 42
    d.ellipse((32, H - 52, 45, H - 39), outline=MUTED2, width=2)
    d.ellipse((68, H - 54, 84, H - 38), outline=MUTED2, width=2)
    d.ellipse((80, H - 58, 88, H - 50), fill=GREEN)

    # Chat panel
    d.rectangle((300, 52, 970, H), fill=BG)
    d.line((970, 52, 970, H), fill="#2b3038", width=2)
    rr(d, (448, 116, 910, 220), 20, fill=PANEL2)
    text(d, (478, 142), "Zotero reference: @williamson2021", TEXT, F18)
    text(d, (478, 178), "can you see my paper?", TEXT2, F18)

    paragraphs = [
        "I am checking the reference and opening the project context.",
        "The Zotero card is found, then linked to the scientific draft.",
        "Yes, I can see it. I can now cite, inspect, and annotate.",
    ]
    y = 282
    for p in paragraphs:
        text(d, (352, y), p, TEXT2, F17)
        y += 72
    rr(d, (360, 612, 900, 684), 12, fill="#171a1f", outline=BORDER)
    text(d, (382, 632), "Williamson, Scott N. & Menounos, Brian. 2021.", TEXT2, F15)
    text(d, (382, 658), "The influence of forest fire aerosol and air temperature...", MUTED, F14)

    # Working state
    d.ellipse((344, 96, 356, 108), outline=MUTED2, width=2)
    text(d, (370, 92), "Working for 3s", MUTED, F18)
    text(d, (370, 126), "↳ provider switch → new Codex session", MUTED2, F15)

    rr(d, (326, H - 112, 938, H - 36), 16, fill="#252b33", outline="#38414d")
    text(d, (350, H - 82), "Ask anything — /skills and CLAUDE.md loaded", MUTED, F16)
    text(d, (356, H - 44), "⚡   +    Full access", TEXT2, F15)
    d.ellipse((896, H - 74, 930, H - 40), fill="#566171")
    text(d, (913, H - 64), "↑", TEXT, F20, anchor="mm")

    # Atelier panel
    d.rectangle((970, 52, W, H), fill="#1d2127")
    rr(d, (994, 78, 1090, 116), 12, fill="#303743")
    text(d, (1024, 88), "Atelier", TEXT2, F17)
    for x, label in [(1120, "◉"), (1160, "▣"), (1200, "⌘"), (1240, "8"), (1290, "▥"), (1340, "↗")]:
        text(d, (x, 90), label, MUTED, F16)
    d.line((970, 132, W, 132), fill="#303743", width=2)
    text(d, (1010, 166), "Atelier", TEXT, F20)
    text(d, (1090, 170), "atelier-studio", MUTED, F17)
    text(d, (1430, 170), "355 files · live", MUTED, F15)
    chips = ["Search", "Sort: modified", "All folders", "Formats (4)"]
    x = 1000
    for chip in chips:
        rr(d, (x, 206, x + 110 + len(chip) * 4, 244), 8, fill="#222832", outline="#35404b")
        text(d, (x + 18, 216), chip, TEXT2, F15)
        x += 130 + len(chip) * 4
    rr(d, (1000, 262, 1110, 300), 8, fill="#252b33", outline="#35404b")
    text(d, (1020, 272), "Favorites (58)", MUTED, F15)
    rr(d, (1120, 262, 1220, 300), 8, fill="#252b33", outline="#35404b")
    text(d, (1140, 272), "Board", TEXT2, F15)

    cards = [
        ("fig_region_season_synthesis.png", "#f6f6f0", "chart"),
        ("fig_fire_slope_forest_specs.svg", "#f3f5f7", "forest"),
        ("figure_dose_decomposition.png", "#f4f6f8", "bars"),
        ("methods_notes.md", "#ffffff", "doc"),
    ]
    positions = [(1000, 338), (1295, 338), (1000, 606), (1295, 606)]
    for (name, fill, kind), (x, y) in zip(cards, positions):
        rr(d, (x, y, x + 270, y + 220), 10, fill="#252b33", outline="#35404b")
        rr(d, (x + 12, y + 12, x + 258, y + 150), 8, fill=fill)
        if kind == "chart":
            for k in range(4):
                yy = y + 42 + k * 25
                d.line((x + 36, yy, x + 238, yy), fill="#d9dde3", width=1)
            pts = [(x + 36 + i * 24, y + 110 - ((i * 17) % 58)) for i in range(9)]
            d.line(pts, fill=ACCENT, width=3)
            d.line([(px, py + 22) for px, py in pts], fill=BLUE, width=3)
        elif kind == "forest":
            for k in range(8):
                yy = y + 34 + k * 15
                d.line((x + 58, yy, x + 210, yy), fill="#d5d9df", width=1)
                d.ellipse((x + 120 + (k % 4) * 22, yy - 3, x + 126 + (k % 4) * 22, yy + 3), fill=BLUE if k % 2 else ACCENT)
        elif kind == "bars":
            for k in range(7):
                yy = y + 44 + k * 14
                d.rectangle((x + 42, yy, x + 210 - k * 14, yy + 8), fill=ACCENT)
                d.rectangle((x + 210 - k * 14, yy, x + 240, yy + 8), fill=BLUE)
        else:
            d.rectangle((x + 86, y + 42, x + 184, y + 122), outline="#a9b4bf", width=8)
            d.polygon([(x + 184, y + 42), (x + 224, y + 82), (x + 184, y + 82)], fill="#dce2e7")
        text(d, (x + 20, y + 170), name, TEXT, F15)
        text(d, (x + 20, y + 198), "outputs/report · synced", MUTED, F13)

    return img


def crop_resize(img: Image.Image, box, width=960) -> Image.Image:
    cropped = img.crop(box)
    h = round(cropped.height * width / cropped.width)
    return cropped.resize((width, h), Image.Resampling.LANCZOS)


def annotate_focus(base: Image.Image, box, label: str, t: float) -> Image.Image:
    img = base.copy()
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 115))
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    pad = int(18 + 8 * t)
    x1, y1, x2, y2 = box
    md.rounded_rectangle((x1 - pad, y1 - pad, x2 + pad, y2 + pad), radius=22, fill=255)
    overlay.putalpha(Image.eval(mask, lambda p: 0 if p else 115))
    img = Image.alpha_composite(img.convert("RGBA"), overlay)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x1 - pad, y1 - pad, x2 + pad, y2 + pad), radius=22, outline=ACCENT, width=5)
    label_w = d.textbbox((0, 0), label, font=F22)[2] + 34
    label_box = (x1 - pad, max(70, y1 - pad - 58), x1 - pad + label_w, max(112, y1 - pad - 12))
    d.rounded_rectangle(label_box, radius=12, fill="#2b313b", outline="#4a5564", width=1)
    d.text((label_box[0] + 17, label_box[1] + 10), label, fill=TEXT, font=F22)
    return img.convert("RGB")


def save_gif(name: str, base: Image.Image, focuses: list[tuple[tuple[int, int, int, int], str]]) -> None:
    frames: list[Image.Image] = []
    for box, label in focuses:
        for i in range(6):
            frame = annotate_focus(base, box, label, i / 5).resize(
                (880, 550), Image.Resampling.LANCZOS
            )
            frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))
        for _ in range(3):
            frame = annotate_focus(base, box, label, 1).resize(
                (880, 550), Image.Resampling.LANCZOS
            )
            frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))
    frames[0].save(
        OUT / name,
        save_all=True,
        append_images=frames[1:],
        duration=110,
        loop=0,
        optimize=True,
        disposal=2,
    )


def story_frame(image: Image.Image, eyebrow: str, title: str, step: int, total: int) -> Image.Image:
    """Turn a complete product view into an editorial README frame."""
    canvas = Image.new("RGB", (960, 600), "#111419")
    shot = cover(image, (960, 520))
    canvas.paste(shot, (0, 0))
    d = ImageDraw.Draw(canvas)
    d.rectangle((0, 520, 960, 600), fill="#171b21")
    d.rectangle((0, 520, 5, 600), fill=ACCENT)
    text(d, (28, 536), eyebrow.upper(), ACCENT, F12)
    text(d, (28, 558), title, TEXT, F22)
    for i in range(total):
        x1 = 760 + i * 56
        d.rounded_rectangle(
            (x1, 566, x1 + 42, 570),
            radius=2,
            fill=ACCENT if i == step else "#3b424d",
        )
    return canvas


def save_story_gif(
    name: str,
    scenes: list[tuple[Image.Image, str, str]],
) -> None:
    frames: list[Image.Image] = []
    rendered = [story_frame(image, eyebrow, title, i, len(scenes)) for i, (image, eyebrow, title) in enumerate(scenes)]
    for i, frame in enumerate(rendered):
        for _ in range(8):
            frames.append(frame)
        next_frame = rendered[(i + 1) % len(rendered)]
        for blend in (0.2, 0.4, 0.6, 0.8):
            frames.append(Image.blend(frame, next_frame, blend))
    paletted = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for frame in frames]
    paletted[0].save(
        OUT / name,
        save_all=True,
        append_images=paletted[1:],
        duration=120,
        loop=0,
        optimize=True,
        disposal=2,
    )


def flow_frame(split: Image.Image, gallery: Image.Image, active: int) -> Image.Image:
    """Show the research loop as three stable, connected product surfaces."""
    canvas = Image.new("RGB", (960, 600), "#111419")
    d = ImageDraw.Draw(canvas)
    text(d, (30, 24), "ONE CONTINUOUS RESEARCH LOOP", MUTED, F12)
    text(d, (30, 48), "Context moves. The project stays.", TEXT, F22)

    sources = [cover(split, (274, 170)), cover(split, (274, 170)), cover(gallery, (274, 170))]
    labels = [
        ("01", "Ask in context", "Project files, history, and\ninstructions stay attached."),
        ("02", "Work with agents", "Reason, edit, and verify\ninside the same workspace."),
        ("03", "Inspect evidence", "Open every figure and\nreturn it to the conversation."),
    ]
    for i, (source, (number, label, description)) in enumerate(zip(sources, labels)):
        x = 30 + i * 305
        canvas.paste(source, (x, 118))
        if i != active:
            veil = Image.new("RGBA", (274, 170), (10, 13, 17, 112))
            canvas.paste(veil, (x, 118), veil)
        d = ImageDraw.Draw(canvas)
        d.rectangle((x, 118, x + 274, 122), fill=ACCENT if i == active else "#3b424d")
        text(d, (x, 320), number, ACCENT if i == active else MUTED, F12)
        text(d, (x, 346), label, TEXT if i == active else TEXT2, F18)
        for line_i, line in enumerate(description.splitlines()):
            text(d, (x, 386 + line_i * 25), line, TEXT2 if i == active else MUTED, F15)
        if i < 2:
            d.line((x + 274, 476, x + 305, 476), fill=ACCENT if i < active else "#3b424d", width=3)
    text(d, (30, 540), "ASK", MUTED, F12)
    d.line((80, 547, 880, 547), fill="#3b424d", width=2)
    d.line((80, 547, 80 + active * 400, 547), fill=ACCENT, width=3)
    text(d, (890, 540), "ADVANCE", MUTED, F12)
    return canvas


def save_flow_gif(name: str, split: Image.Image, gallery: Image.Image) -> None:
    frames: list[Image.Image] = []
    rendered = [flow_frame(split, gallery, active) for active in range(3)]
    for i, frame in enumerate(rendered):
        for _ in range(9):
            frames.append(frame)
        next_frame = rendered[(i + 1) % len(rendered)]
        for blend in (0.25, 0.5, 0.75):
            frames.append(Image.blend(frame, next_frame, blend))
    paletted = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for frame in frames]
    paletted[0].save(
        OUT / name,
        save_all=True,
        append_images=paletted[1:],
        duration=120,
        loop=0,
        optimize=True,
        disposal=2,
    )


def draw_library() -> Image.Image:
    img = Image.new("RGB", (1200, 760), "#20242a")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 1200, 58), fill="#1b1e24")
    dot(d, 22, 20, "#ff5f57")
    dot(d, 54, 20, "#ffbd2e")
    dot(d, 86, 20, "#28c840")
    text(d, (128, 22), "Atelier · Library", TEXT2, F18)

    d.rectangle((0, 58, 250, 760), fill=SIDE)
    text(d, (28, 100), "COLLECTIONS", MUTED, F12)
    collections = [
        ("All papers", 842, True),
        ("Forest fire aerosols", 67, False),
        ("Glacier albedo", 124, False),
        ("Methods", 38, False),
        ("To cite", 12, False),
    ]
    y = 144
    for label, count, active in collections:
        if active:
            rr(d, (18, y - 12, 230, y + 28), 8, fill="#252b33")
        text(d, (34, y - 2), "▦", BLUE if active else MUTED, F16)
        text(d, (62, y - 4), label, TEXT2 if active else MUTED, F15)
        text(d, (210, y - 4), str(count), MUTED2, F13, anchor="ra")
        y += 42

    d.rectangle((250, 58, 760, 760), fill=BG)
    text(d, (286, 98), "Zotero Library", TEXT, F24)
    rr(d, (286, 138, 728, 180), 10, fill="#252b33", outline=BORDER)
    text(d, (310, 150), "Search title, DOI, author, citekey...", MUTED, F15)
    rows = [
        ("Williamson & Menounos", "Forest fire aerosol and glacier albedo", "2021", True),
        ("Box et al.", "Greenland ice-sheet surface mass balance", "2022", False),
        ("Painter et al.", "Dust radiative forcing in snow", "2018", False),
        ("Musselman et al.", "Snowmelt timing and energy balance", "2023", False),
        ("Flanner et al.", "Aerosol forcing in cryosphere models", "2020", False),
    ]
    y = 220
    for author, title, year, active in rows:
        if active:
            rr(d, (278, y - 14, 742, y + 66), 10, fill="#2b313b", outline="#465160")
        else:
            d.line((286, y + 66, 730, y + 66), fill="#313943", width=1)
        text(d, (306, y), author, TEXT2 if active else MUTED, F16)
        text(d, (306, y + 26), title, TEXT if active else TEXT2, F15)
        text(d, (704, y), year, MUTED, F13)
        y += 86

    d.rectangle((760, 58, 1200, 760), fill="#1d2127")
    text(d, (804, 98), "Reference card", TEXT, F24)
    rr(d, (804, 140, 1148, 360), 14, fill="#252b33", outline="#38414d")
    text(d, (832, 168), "@williamson2021", ACCENT, F18)
    text(d, (832, 210), "The influence of forest fire aerosol", TEXT, F18)
    text(d, (832, 240), "and air temperature on glacier albedo", TEXT, F18)
    text(d, (832, 292), "Remote Sensing of Environment · DOI verified", MUTED, F15)
    rr(d, (832, 390, 972, 430), 10, fill="#303743", outline="#465160")
    text(d, (862, 402), "Add to chat", TEXT, F15)
    rr(d, (990, 390, 1132, 430), 10, fill="#252b33", outline="#465160")
    text(d, (1018, 402), "Copy BibTeX", TEXT2, F15)

    rr(d, (804, 470, 1148, 650), 14, fill="#171a1f", outline=BORDER)
    text(d, (832, 498), "Linked context", TEXT2, F16)
    text(d, (832, 536), "• references.bib", MUTED, F15)
    text(d, (832, 570), "• manuscript methods section", MUTED, F15)
    text(d, (832, 604), "• current agent thread", MUTED, F15)
    return img


def main() -> None:
    split = load_baseline("1512x883-dark-split-thread-actif.png")
    gallery = load_baseline("1512x883-dark-galerie-formats.png")

    draw_banner().save(OUT / "atelier-banner.png", quality=95)
    split.resize((1600, 934), Image.Resampling.LANCZOS).save(
        OUT / "atelier-hero.png", quality=95
    )
    # Keep the complete workspace visible and focus the agent area through
    # contrast. Cropping the transcript made long research lines look broken.
    annotate_focus(
        split,
        (118, 96, 1048, 838),
        "Project-aware agent workspace",
        1,
    ).resize((1600, 934), Image.Resampling.LANCZOS).save(
        OUT / "chat-workspace.png", quality=94
    )
    gallery.resize((1600, 934), Image.Resampling.LANCZOS).save(
        OUT / "atelier-gallery.png", quality=94
    )
    crop_resize(split, (0, 48, 430, 883), width=620).save(
        OUT / "sidebar-projects.png", quality=94
    )
    crop_resize(split, (70, 720, 1050, 883), width=1200).save(
        OUT / "composer.png", quality=94
    )
    draw_library().save(OUT / "library-zotero.png", quality=94)

    save_story_gif(
        "atelier-tour.gif",
        [
            (split, "01 · Project context", "Keep the work organized around one project"),
            (split, "02 · Agent workspace", "Reason and act with the evidence in view"),
            (gallery, "03 · Scientific atelier", "Inspect every figure, file, and result"),
        ],
    )
    save_flow_gif("agent-flow.gif", split, gallery)

    for name in (
        "atelier-banner.png",
        "atelier-hero.png",
        "atelier-tour.gif",
        "agent-flow.gif",
        "chat-workspace.png",
        "atelier-gallery.png",
        "sidebar-projects.png",
        "composer.png",
        "library-zotero.png",
    ):
        shutil.copy2(OUT / name, WEB_OUT / name)


if __name__ == "__main__":
    main()
