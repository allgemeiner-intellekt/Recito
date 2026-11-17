#!/usr/bin/env bash
# Assembles the single-file prototype from parts/. Usage: prototype/build.sh
set -euo pipefail
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="en" data-theme="light" data-ink="blue">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Recito redesign prototype</title>\n<style>\n'
  cat parts/styles.css
  printf '</style>\n</head>\n<body>\n'
  cat parts/body.html
  printf '<script>\n'
  cat parts/app.js
  printf '</script>\n</body>\n</html>\n'
} > recito-redesign.html
wc -c recito-redesign.html
