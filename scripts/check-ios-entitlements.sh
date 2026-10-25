#!/usr/bin/env bash
# Confirms an iOS build can do Sign in with Apple and Google before you send it
# to TestFlight: prints the Sign in with Apple entitlement, the team/app ID it
# was signed for, the version, and the Google URL scheme. macOS only.
#
#   bash scripts/check-ios-entitlements.sh <EAS build ID>     # downloads the IPA
#   bash scripts/check-ios-entitlements.sh path/to/app.ipa
#
# No "com.apple.developer.applesignin" line means the provisioning profile
# didn't include the capability: enable Sign in with Apple on the App ID, then
# rebuild interactively so EAS can refresh the profile.
set -euo pipefail

src=${1:?Usage: check-ios-entitlements.sh <EAS build ID | path to .ipa>}
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

if [ -f "$src" ]; then
  cp "$src" "$dir/app.ipa"
else
  url=$(npx eas-cli build:view "$src" --json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s).artifacts||{}).buildUrl||""))')
  [ -n "$url" ] || { echo "No IPA for build $src (still building, or not an iOS store build)."; exit 1; }
  curl -sSL -o "$dir/app.ipa" "$url"
fi

unzip -q "$dir/app.ipa" -d "$dir/x"
app=$(ls -d "$dir"/x/Payload/*.app)

echo "== Entitlements"
codesign -d --entitlements :- "$app" 2>/dev/null > "$dir/ent.plist"
for k in com.apple.developer.applesignin application-identifier com.apple.developer.team-identifier aps-environment; do
  v=$(/usr/libexec/PlistBuddy -c "Print :$k" "$dir/ent.plist" 2>/dev/null | tr -s ' \n' ' ' || true)
  echo "$k: ${v:-(missing)}"
done

echo "== Info.plist"
echo "version: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Info.plist") ($(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Info.plist"))"
scheme=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' "$app/Info.plist" 2>/dev/null | grep -o 'com\.googleusercontent\.apps\.[^ ]*' || true)
[ -n "$scheme" ] || scheme="(missing: check iosUrlScheme in the google-signin plugin config)"
echo "Google URL scheme: $scheme"
