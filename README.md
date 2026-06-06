# Hermes Memory Universe

A public-safe, static 3D multi-nebula atlas for Jeffery's Hermes Agent system.

## What this is

- GitHub Pages friendly static web app
- 3D draggable / rotatable / zoomable memory universe
- Public-safe daily snapshot from local Hermes data
- Multi-nebula graph: Memory, Skills, Tools, Aesthetic, Investment, Automation, Sessions

## What this is not

It is not a private backend and it does not publish raw Hermes data. The exporter intentionally avoids raw sessions, secrets, local paths, Discord IDs, Google IDs, and investment note bodies.

## Local development

```bash
npm install
npm run export:data
npm run dev
```

## Build

```bash
npm run build
```

## Sync snapshot to GitHub

```bash
./scripts/sync_to_github.sh
```

GitHub Pages deploys from `.github/workflows/deploy.yml`.
