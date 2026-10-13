#!/usr/bin/env bash
# Collega ogni skill in skills/ dentro ~/.claude/skills/ (symlink).
# Rilancialo dopo aver aggiunto una skill nuova. Non sovrascrive cartelle reali.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)/skills"
dest="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
mkdir -p "$dest"
for dir in "$src"/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/SKILL.md" ] || { echo "skip $name (manca SKILL.md)"; continue; }
  target="$dest/$name"
  if [ -L "$target" ]; then
    ln -sfn "${dir%/}" "$target"; echo "ok   $name"
  elif [ -e "$target" ]; then
    echo "SKIP $name: $target esiste e non è un symlink"
  else
    ln -s "${dir%/}" "$target"; echo "new  $name"
  fi
done
