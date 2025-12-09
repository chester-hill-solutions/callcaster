#!/bin/bash
set -e

cd /Users/ladmin/Documents/callcaster

echo "=== Checking git status ==="
git status --short

echo ""
echo "=== Staging all changes ==="
git add -A

echo ""
echo "=== Changes to be committed ==="
git status --short

echo ""
echo "=== Committing changes ==="
git commit -m "fix: resolve case-sensitivity issues for Workspace components

- Rename app/components/workspace/ to app/components/Workspace/ to match imports
- Update import paths from ~/components/workspace/ to ~/components/Workspace/
- Fixes build errors on case-sensitive filesystems (Linux/Docker)

This ensures all imports use correct casing matching the directory structure."

echo ""
echo "=== Pushing to origin master ==="
git push origin master

echo ""
echo "✅ Done! Changes have been committed and pushed to master."
