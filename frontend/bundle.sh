#!/bin/bash
set -euo pipefail

npx craco build

OUTFILE=build/index.html
sed 's/<\/head><body>.*//g' build/index.html | sed 's/.*<head><script>/<script>/g' > build/script.html
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"></head>'
  echo '<body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div></body>'
  cat build/script.html
  echo '</html>'
} > "$OUTFILE"
rm -f build/script.html
