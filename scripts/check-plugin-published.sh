#!/usr/bin/env bash
# Fail when the marketplace repository no longer matches plugin/.
#
# Reads the published copy over plain git (the repository is public, so this
# needs no token) and diffs it against the source of truth here. Publishing is a
# deliberate act — ./scripts/publish-plugin.sh — and this is the thing that says
# out loud that it has not happened yet.
set -euo pipefail

REPO="${MOZG_PLUGIN_REPO:-egorfedorov/mozg-plugin}"
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if ! git clone -q --depth 1 "https://github.com/$REPO.git" "$work/repo" 2>/dev/null; then
  echo "note  could not reach $REPO — skipping the published-plugin check"
  exit 0
fi

# Compare only what publish-plugin.sh syncs. .DS_Store is macOS litter that must
# never reach the marketplace, so it is excluded on both sides rather than
# tolerated on one.
if diff -r --exclude '.DS_Store' "$root/plugin" "$work/repo/plugin" >"$work/diff" 2>&1; then
  echo "✓ $REPO matches plugin/"
  exit 0
fi

echo "✗ $REPO is out of date — users are installing something else than this repo has:"
head -40 "$work/diff"
echo
echo "  publish it:  ./scripts/publish-plugin.sh"
exit 1
