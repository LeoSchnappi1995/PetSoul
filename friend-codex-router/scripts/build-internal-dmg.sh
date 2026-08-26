#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
BUILD_DIR="$PROJECT_DIR/build/internal-macos"
APP_NAME="Friend Codex Router"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
RESOURCES="$CONTENTS/Resources"
STAGE_DIR="$BUILD_DIR/dmg"
OUTPUT_DMG="$PROJECT_DIR/dist/Friend-Codex-Router-0.3.1-internal.dmg"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"

rm -rf "$BUILD_DIR"
mkdir -p "$CONTENTS/MacOS" "$RESOURCES/node/bin" "$RESOURCES/app" "$STAGE_DIR" "$PROJECT_DIR/dist"

swiftc "$PROJECT_DIR"/macos/*.swift \
  -parse-as-library \
  -target arm64-apple-macos13.0 \
  -framework SwiftUI \
  -framework AppKit \
  -framework CryptoKit \
  -framework Foundation \
  -framework ServiceManagement \
  -o "$CONTENTS/MacOS/FriendCodexRouterSetup"

cp "$NODE_BIN" "$RESOURCES/node/bin/node"
cp -R "$PROJECT_DIR/src" "$RESOURCES/app/src"
node "$PROJECT_DIR/scripts/render-package-config.mjs" "$PROJECT_DIR/config.example.json" "$RESOURCES/app/config.example.json"
cp "$PROJECT_DIR/package.json" "$RESOURCES/app/package.json"

plutil -create xml1 "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string FriendCodexRouterSetup" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.friend-codex-router.setup" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleName string $APP_NAME" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $APP_NAME" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string APPL" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string 0.3.1" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string 5" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 13.0" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$CONTENTS/Info.plist"

chmod 755 "$CONTENTS/MacOS/FriendCodexRouterSetup" "$RESOURCES/node/bin/node"
codesign --force --deep --options runtime --sign "$SIGN_IDENTITY" "$APP_DIR"

cp -R "$APP_DIR" "$STAGE_DIR/$APP_NAME.app"
ln -s /Applications "$STAGE_DIR/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE_DIR" -ov -format UDZO "$OUTPUT_DMG"
echo "$OUTPUT_DMG"
