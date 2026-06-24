#!/bin/bash
# Start Next.js without forcing a port, let it auto-select
npx next dev 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" =~ Local:\ +http://localhost:([0-9]+) ]]; then
    PORT="${BASH_REMATCH[1]}"
    open "http://localhost:$PORT"
  fi
done
