#!/usr/bin/env bash
# Publish plugin/ to the marketplace repository people actually install from.
#
#   ./scripts/publish-plugin.sh            # push
#   ./scripts/publish-plugin.sh --dry       # show what would change
#
# The plugin lives here, next to the server whose tools it documents, so a change
# to a tool and the command that uses it land in one commit. But Claude Code
# installs from `egorfedorov/mozg-plugin` — a separate repository — and nothing
# connected the two. They drifted silently: the published copy sat at 0.2.0 with
# five commands while this one had seven and a rewritten hook, so work that was
# live on the server reached nobody.
#
# This is the deliberate step that closes that gap, and .github/workflows/ci.yml
# fails when the two diverge, so the gap cannot reopen quietly.
set -euo pipefail

REPO="${MOZG_PLUGIN_REPO:-egorfedorov/mozg-plugin}"
dry=0
[ "${1:-}" = "--dry" ] && dry=1

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

git clone -q "https://github.com/$REPO.git" "$work/repo"

# What the marketplace serves: the plugin itself, the manifest that lists it,
# and the README as the repository's front page — the two READMEs have always
# been the same file, so this keeps them one file rather than two that agree
# until somebody edits one.
rsync -a --delete --exclude '.DS_Store' "$root/plugin/" "$work/repo/plugin/"
mkdir -p "$work/repo/.claude-plugin"
cp "$root/.claude-plugin/marketplace.json" "$work/repo/.claude-plugin/marketplace.json"
cp "$root/plugin/README.md" "$work/repo/README.md"

cd "$work/repo"
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "✓ $REPO already matches plugin/ — nothing to publish"
  exit 0
fi

version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' plugin/.claude-plugin/plugin.json | head -1)
echo "→ changes for $REPO (plugin $version):"
git --no-pager diff --stat
git status --porcelain | grep '^??' || true

if [ "$dry" = 1 ]; then
  echo "(dry run — nothing pushed)"
  exit 0
fi

git add -A
git commit -q -m "Publish plugin $version from mozg@$(git -C "$root" rev-parse --short HEAD)

Synced by scripts/publish-plugin.sh. The source of truth is plugin/ in
egorfedorov/mozg — edit there, publish here."
git push -q origin HEAD
echo "✓ published plugin $version to $REPO"
