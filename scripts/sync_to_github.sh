#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/export_memory_universe.py >/dev/null
npm run build -- --outDir docs >/dev/null
mkdir -p docs
touch docs/.nojekyll
git add public/data/graph.json docs src scripts package.json package-lock.json vite.config.js README.md index.html
if git diff --cached --quiet; then
  exit 0
fi
git commit -m "chore: sync memory universe snapshot" >/dev/null
git push >/dev/null
