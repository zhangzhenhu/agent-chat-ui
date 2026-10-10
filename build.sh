#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

PACKAGE_DIR="$SCRIPT_DIR/dist-static-web-server"
ZIP_GLOB="$PACKAGE_DIR/agent-chat-ui-static-web-server-*.zip"
MAC_SERVER="$SCRIPT_DIR/static-web-server-binaries/static-web-server"
WINDOWS_SERVER="$SCRIPT_DIR/static-web-server-binaries/static-web-server.exe"

fail() {
  echo "Error: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is required."
command -v pnpm >/dev/null 2>&1 || fail "pnpm is required."
command -v zip >/dev/null 2>&1 || fail "zip is required."

[ -f "$SCRIPT_DIR/package.json" ] || fail "package.json was not found."
[ -f "$SCRIPT_DIR/pnpm-lock.yaml" ] || fail "pnpm-lock.yaml was not found."
[ -f "$MAC_SERVER" ] || fail "Missing macOS server binary: $MAC_SERVER"
[ -f "$WINDOWS_SERVER" ] || fail "Missing Windows server binary: $WINDOWS_SERVER"

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install --frozen-lockfile
fi

chmod +x "$MAC_SERVER"
echo "Building static UI and packaging the web server..."
pnpm static:package

ZIP_PATH=$(find "$PACKAGE_DIR" -maxdepth 1 -type f -name "agent-chat-ui-static-web-server-*.zip" -print | sort | tail -n 1)
[ -n "$ZIP_PATH" ] && [ -f "$ZIP_PATH" ] || fail "Timestamped ZIP was not generated."
echo ""
echo "Done. ZIP package:"
echo "$ZIP_PATH"
