#!/bin/sh
# Exits 0 when loginRedirect() returns "/dashboard"; nonzero otherwise.
set -e
out=$(node app.js)
case "$out" in
  /dashboard) exit 0 ;;
  *) echo "verify: got '$out', want '/dashboard'" >&2; exit 1 ;;
esac
