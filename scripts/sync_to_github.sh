#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/export_memory_universe.py
npm run build
git add public/data/graph.json src scripts .github package.json package-lock.json vite.config.js README.md index.html
if git diff --cached --quiet; then
  echo "No changes to sync."
  exit 0
fi
git commit -m "chore: sync memory universe snapshot"
git push
