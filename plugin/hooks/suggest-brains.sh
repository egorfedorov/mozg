#!/usr/bin/env bash
# Runs at session start, offline and in milliseconds: look at what this repo
# is built with, and tell the agent which mozg brains are worth asking before
# it answers from stale training data. No network — the hint costs nothing
# when no brain matches, and brain_list is one call away when one does.
set -u

hits=""
add() { hits="${hits:+$hits, }$1"; }

# The stack shows up in the dependency manifest, not in the source tree walk.
pkg=""
[ -f package.json ] && pkg=$(cat package.json 2>/dev/null)

case "$pkg" in *'"svelte"'*|*'"@sveltejs/kit"'*) add "svelte (Svelte 5 / SvelteKit)";; esac
case "$pkg" in *'"tailwindcss"'*) add "tailwind-v4";; esac
case "$pkg" in *'"@modelcontextprotocol/'*|*'"mcp"'*) add "mcp (protocol + building servers)";; esac

# Slot / Stake Engine projects name themselves in configs and folders.
if [ -f stakeengine.config.ts ] || [ -d math-sdk ] || grep -qs "stake-engine\|stakeengine" package.json Makefile 2>/dev/null; then
  add "stake-engine (docs) and the slot-studio family (mechanics, approval, frontend)"
fi

if [ -n "$hits" ]; then
  echo "mozg: this repo looks like it uses: $hits."
  echo "Before answering questions about those from memory, call brain_list and search the matching brain — its material is newer than training data and exam-scored."
fi
exit 0
