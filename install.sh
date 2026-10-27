#!/bin/sh
# Swot installer for macOS and Linux:
#   curl -fsSL https://raw.githubusercontent.com/Samurai007AK/swot/main/install.sh | sh
# Run it again to update. Your courses in ~/.swot/sets are never touched.
set -eu

REPO="Samurai007AK/swot"
SRC="${SWOT_SOURCE:-https://codeload.github.com/$REPO/tar.gz/refs/heads/main}"
DIR="${SWOT_HOME:-$HOME/.swot}"
APP="$DIR/app"
BIN="$HOME/.local/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "Swot needs Node.js 20 or newer. Install it from https://nodejs.org and run this again."; exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "Swot needs Node.js 20 or newer (you have $(node -v)). Update it from https://nodejs.org and run this again."; exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Downloading Swot..."
case "$SRC" in
  http*) curl -fsSL "$SRC" -o "$tmp/swot.tgz" ;;
  *) cp "$SRC" "$tmp/swot.tgz" ;;
esac
mkdir "$tmp/x"
tar -xzf "$tmp/swot.tgz" -C "$tmp/x"
src=$(find "$tmp/x" -mindepth 1 -maxdepth 1 -type d | head -n 1) # the archive holds one top folder

mkdir -p "$DIR"
rm -rf "$APP"
mv "$src" "$APP"
echo "Installing..."
(cd "$APP" && npm install --omit=dev --no-audit --no-fund --loglevel=error)

mkdir -p "$BIN"
printf '#!/bin/sh\nexec node "%s/bin/swot.js" "$@"\n' "$APP" > "$BIN/swot"
chmod +x "$BIN/swot"

echo ""
echo "Swot is installed. Start it any time with:  swot"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "(Your PATH doesn't include $BIN yet. Add it, or start Swot with: $BIN/swot)" ;;
esac
if ! command -v claude >/dev/null 2>&1 && ! command -v codex >/dev/null 2>&1; then
  echo "Note: Swot uses Claude Code or Codex for the AI. Install one and sign in before you start a lesson."
fi
[ -n "${SWOT_NO_START:-}" ] || exec "$BIN/swot"
