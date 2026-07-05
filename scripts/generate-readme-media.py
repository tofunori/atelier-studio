#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "media"
OUT.mkdir(parents=True, exist_ok=True)

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


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
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


def rr(draw: ImageDraw.ImageDraw, box, radius=10, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, s, fill=TEXT2, f=F16, anchor=None):
    draw.text(xy, s, fill=fill, font=f, anchor=anchor)


def dot(draw, x, y, c):
    draw.ellipse((x, y, x + 18, y + 18), fill=c)


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
    actions = [("✎", "Nouveau chat"), ("⌕", "Rechercher"), ("⇩", "Reprendre une session")]
    y = 116
    for icon, label in actions:
        text(d, (28, y), icon, MUTED, F18)
        text(d, (58, y), label, TEXT2, F17)
        y += 44
    text(d, (28, 272), "▾  PROJETS", MUTED, F12)
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
    text(d, (478, 142), "Référence Zotero : @williamson2021", TEXT, F18)
    text(d, (478, 178), "vois tu mon article", TEXT2, F18)

    paragraphs = [
        "Je vérifie la référence et j’ouvre le contexte du projet.",
        "La fiche Zotero est trouvée, puis liée au brouillon scientifique.",
        "Oui, je le vois. Je peux maintenant citer, inspecter et annoter.",
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
    text(d, (370, 126), "↳ changement de provider → nouvelle session codex", MUTED2, F15)

    rr(d, (326, H - 112, 938, H - 36), 16, fill="#252b33", outline="#38414d")
    text(d, (350, H - 82), "Demande n'importe quoi — /skills et CLAUDE.md chargés", MUTED, F16)
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
        for i in range(9):
            frames.append(annotate_focus(base, box, label, i / 8).resize((960, 600), Image.Resampling.LANCZOS))
        for _ in range(5):
            frames.append(annotate_focus(base, box, label, 1).resize((960, 600), Image.Resampling.LANCZOS))
    frames[0].save(
        OUT / name,
        save_all=True,
        append_images=frames[1:],
        duration=80,
        loop=0,
        optimize=True,
    )


def draw_bibliotheque() -> Image.Image:
    img = Image.new("RGB", (1200, 760), "#20242a")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 1200, 58), fill="#1b1e24")
    dot(d, 22, 20, "#ff5f57")
    dot(d, 54, 20, "#ffbd2e")
    dot(d, 86, 20, "#28c840")
    text(d, (128, 22), "Atelier · Bibliotheque", TEXT2, F18)

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
    text(d, (286, 98), "Bibliotheque Zotero", TEXT, F24)
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
    base = draw_window()
    base.save(OUT / "atelier-hero.png", quality=95)
    crop_resize(base, (0, 52, 970, H), width=1100).save(OUT / "chat-workspace.png", quality=94)
    crop_resize(base, (970, 52, W, H), width=900).save(OUT / "atelier-gallery.png", quality=94)
    crop_resize(base, (0, 52, 330, H), width=520).save(OUT / "sidebar-projects.png", quality=94)
    crop_resize(base, (326, 820, 938, H - 20), width=900).save(OUT / "composer.png", quality=94)
    draw_bibliotheque().save(OUT / "bibliotheque-zotero.png", quality=94)
    save_gif(
        "atelier-tour.gif",
        base,
        [
            ((20, 90, 286, 874), "Projects and sessions"),
            ((318, 88, 952, 932), "Multi-agent chat"),
            ((986, 76, 1570, 936), "Live research atelier"),
        ],
    )
    save_gif(
        "agent-flow.gif",
        base,
        [
            ((338, 84, 910, 160), "Working state"),
            ((326, 820, 938, 966), "Composer and controls"),
            ((1000, 338, 1570, 826), "Figures, files, and boards"),
        ],
    )


if __name__ == "__main__":
    main()
