# Atelier website

The public-facing Atelier presentation: a restrained graphite and copper page, English product copy, real interface captures, a silent tour, and interactive surface and theme previews.

## Local development

```sh
cd website
npm ci
npm run dev -- --host 127.0.0.1 --port 4200
```

## Validation

```sh
npm test
npm run lint
```

The build uses vinext and the existing Cloudflare worker integration. `npm test` builds the production worker and verifies its rendered HTML. Deployment configuration is retained; a successful local build does not publish the site.

## Media

Public visuals live in `public/media/`, mirrored from `docs/media/public/`. See [the capture guide](../scripts/public-demo/README.md). Never use screenshots from a personal workspace. The surface and theme previews are captures of rendered components, not CSS recolourings of one screenshot.

The tour is user-initiated, silent, and has native playback controls. All motion respects reduced-motion preferences; no video autoplays.

## Design

See [DESIGN.md](DESIGN.md). Update the website and root README together when changing product claims, installation requirements, or visual assets.
