# Atelier — quiet editorial

## 1. Atmosphere
Graphite, warm copper, and generous space. The product imagery is the visual anchor; the page introduces three research workflows without turning into a feature catalogue.

## 2. Palette
Canvas #191a1c; raised surface #202123; primary text #e9e6e0; secondary text #aaa8a4; accent #ca926b; dividers #ffffff16. The accent marks the central promise and download action.

## 3. Typography
Helvetica Neue with system fallbacks. Display 51–106px, weight 400, tracking −.055em; section headings 36–50px, weight 400, tracking −.035em. Body 15–18px, line height 1.65. Small labels 12px. No external font request.

## 4. Components
Buttons use 6px corners and 44px minimum targets; media uses 8px corners. Navigation is textual. Selected preview controls use a subtle surface change and aria-pressed. Visible copper focus outlines. Hover changes are pointer-only; pressed states scale to .98.

## 5. Layout
1240px maximum width, desktop gutters 56px, mobile 20px. Hero promise → surface explorer → three workflows → tour → theme preview → installation. Screenshots have explicit aspect ratios to avoid layout shifts.

## 6. Depth
One shallow shadow under the hero capture. Sections rely on spacing and faint separators. No decorative gradient or glass layer.

## 7. Guardrails
Use fictional demo content only. Capture production components. Never reconstruct app controls in an image editor. No automatic video playback. Avoid heavy headings, button outlines, generic card grids, and unverified feature claims.

## 8. Responsive behaviour
At 800px, headings and explanatory copy stack. At 560px, the menu becomes a disclosure and workflows stack. Images remain proportional and surface screenshots open at full size. Native video controls remain available. Reduced motion disables smooth scrolling and transitions.

## 9. Follow-up prompts
- Add a section on #191a1c with a 40px/400 heading, −.035em tracking, #aaa8a4 body at 16px/1.65, and 64px vertical spacing.
- Add a textual preview control with 6px corners, 44px minimum height, 13px text, #ffffff0c selected background, and a 2px #ca926b focus outline.
- Add a real 1600×1000 demo capture with 8px corners and a 12px #aaa8a4 caption. Keep all example material fictional.

CSS strategy: retain the existing global stylesheet, using one plain CSS token system; no added styling framework or animation dependency.
