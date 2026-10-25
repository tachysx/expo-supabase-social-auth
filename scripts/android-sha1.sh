#!/usr/bin/env bash
# Prints the SHA-1 (and SHA-256) of the key that signed your latest finished
# EAS Android build: the "upload key". Google's Android OAuth client needs it.
#
#   cd your-expo-app && bash path/to/scripts/android-sha1.sh
#
# Google Play re-signs every app it installs with its own "app signing" key, so
# you need a SECOND Android OAuth client with that SHA-1. Copy it from
# Play Console → Test and release → App integrity → App signing →
# "App signing key certificate". Without it, Google sign-in fails with
# DEVELOPER_ERROR on installs from Play.
set -euo pipefail

command -v keytool >/dev/null || { echo "keytool not found: install a JDK (e.g. brew install openjdk)"; exit 1; }

url=$(npx eas-cli build:list --platform android --status finished --limit 1 --json --non-interactive \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s)[0];if(!b){process.exit(1)};const a=b.artifacts||{};console.log(a.buildUrl||a.applicationArchiveUrl||"")})')
[ -n "$url" ] || { echo "No finished Android build found on EAS."; exit 1; }

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
echo "Downloading $url"
curl -sSL -o "$dir/app.bin" "$url"
echo
keytool -printcert -jarfile "$dir/app.bin" | grep -E 'Owner:|SHA1:|SHA256:'
echo
echo "Add the SHA1 above to an Android OAuth client (package = your Android package name)."
echo "Add the Play app-signing SHA-1 (Play Console → App integrity) to a second one."
