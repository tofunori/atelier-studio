# Atelier website

The public-facing Atelier presentation: a restrained graphite and copper page, English product copy, real interface captures, a silent tour, and interactive surface and theme previews.

## Local development

```sh
cd website
npm ci
npm run dev -- --hostname 127.0.0.1 --port 4200
```

## Validation

```sh
npm test
npm run lint
```

Open http://127.0.0.1:4200/atelier-studio/ for the local preview.

The build uses Next.js static export and writes `out/`. Tests verify the exported HTML, base-path asset references, and public media. No server or Cloudflare account is required for hosting.

## Publication

The `pages.yml` GitHub Actions workflow builds, tests, and publishes `website/out/` when website changes reach `main`, or when manually dispatched. GitHub Pages must use GitHub Actions as its publishing source.

Public address: https://tofunori.github.io/atelier-studio/

`app/site.ts` centralizes the public URL and asset prefix. For a future custom domain, update that URL and set `NEXT_PUBLIC_BASE_PATH` to an empty string when building. Historical vinext/Cloudflare integration files are unused by this deployment.

## Media

Public visuals live in `public/media/`, mirrored from `docs/media/public/`. See [the capture guide](../scripts/public-demo/README.md). Never use screenshots from a personal workspace. The surface and theme previews are captures of rendered components, not CSS recolourings of one screenshot.

The tour is user-initiated, silent, and has native playback controls. All motion respects reduced-motion preferences; no video autoplays.

## Design

See [DESIGN.md](DESIGN.md). Update the website and root README together when changing product claims, installation requirements, or visual assets.
