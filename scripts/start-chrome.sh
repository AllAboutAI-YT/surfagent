#!/bin/bash

# Start Chrome with remote debugging enabled
# Uses a separate profile with copied auth data (required for Chrome 136+)

PORT=${1:-9222}
MAIN_PROFILE="$HOME/Library/Application Support/Google/Chrome/Default"
DEBUG_PROFILE="/tmp/chrome-cdp"

echo "Setting up Chrome debug profile..."

# Create debug profile directory
mkdir -p "$DEBUG_PROFILE/Default"

# Copy auth data from main profile (preserves your logins)
cp "$MAIN_PROFILE/Cookies" "$DEBUG_PROFILE/Default/" 2>/dev/null
cp "$MAIN_PROFILE/Login Data" "$DEBUG_PROFILE/Default/" 2>/dev/null
cp "$MAIN_PROFILE/Login Data For Account" "$DEBUG_PROFILE/Default/" 2>/dev/null

echo "Starting Chrome with remote debugging on port $PORT..."
echo "Note: This uses a separate profile with your login cookies copied over."
echo ""

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir="$DEBUG_PROFILE" \
  --remote-debugging-port=$PORT \
  --disable-save-password-bubble \
  --disable-popup-blocking \
  --disable-notifications \
  --disable-infobars \
  --disable-translate \
  --disable-features=PasswordManager,AutofillSaveCardBubble,TranslateUI \
  --password-store=basic
