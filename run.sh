#!/bin/bash
# Build and start Next.js in production mode.
set -euo pipefail

npx next build
npx next start 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" =~ Local:\ +http://localhost:([0-9]+) ]]; then
    PORT="${BASH_REMATCH[1]}"
    open "http://localhost:$PORT"
  fi
done
