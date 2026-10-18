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

# ffmpeg serve a /sequence-take per codificare i video. Si usa quello nel PATH;
# se manca, si installa ffmpeg-static in node_modules/ di questa repo.
root="$(dirname "$src")"
if command -v ffmpeg >/dev/null 2>&1; then
  echo "ok   ffmpeg ($(command -v ffmpeg))"
elif [ -x "$root/node_modules/ffmpeg-static/ffmpeg" ]; then
  echo "ok   ffmpeg (ffmpeg-static)"
else
  (cd "$root" && npm install --no-audit --no-fund) && echo "new  ffmpeg (ffmpeg-static)"
fi
