## Critical Rule: Always Close Unused Tabs

After completing any task, close tabs you no longer need:
```bash
node dist/browser.js close all  # Keeps only first tab
node dist/browser.js list       # Verify
```

---

## Setup

### Start Chrome with Debug Mode

Chrome 136+ blocks remote debugging on the default profile for security. Use a separate profile with your cookies copied:

```bash
# Run the helper script (copies cookies from main profile)
./scripts/start-chrome.sh

# Or manually:
pkill -9 "Google Chrome"
mkdir -p /tmp/chrome-cdp/Default
cp ~/Library/Application\ Support/Google/Chrome/Default/Cookies /tmp/chrome-cdp/Default/
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir=/tmp/chrome-cdp \
  --remote-debugging-port=9222
```

### Start the API Server

```bash
npm run api   # Starts on http://localhost:3456
```

---

## API Endpoints (preferred for agents)

The API is the primary interface. Always **recon first, then act**.

See `API.md` for full documentation with examples.

```bash
# Recon a page — get full map of elements, forms, selectors
curl -X POST localhost:3456/recon -H 'Content-Type: application/json' -d '{"url":"https://example.com","keepTab":true}'

# Read page content — structured text, tables, notifications
curl -X POST localhost:3456/read -H 'Content-Type: application/json' -d '{"tab":"0"}'

# Fill form fields — real CDP keystrokes
curl -X POST localhost:3456/fill -H 'Content-Type: application/json' -d '{"tab":"0","fields":[{"selector":"#email","value":"test@example.com"}],"submit":"enter"}'

# Click an element
curl -X POST localhost:3456/click -H 'Content-Type: application/json' -d '{"tab":"0","text":"Submit"}'

# Scroll
curl -X POST localhost:3456/scroll -H 'Content-Type: application/json' -d '{"tab":"0","direction":"down","amount":1000}'

# Navigate (same tab)
curl -X POST localhost:3456/navigate -H 'Content-Type: application/json' -d '{"tab":"0","url":"https://example.com"}'

# Go back
curl -X POST localhost:3456/navigate -H 'Content-Type: application/json' -d '{"tab":"0","back":true}'

# Run JavaScript in a tab or iframe
curl -X POST localhost:3456/eval -H 'Content-Type: application/json' -d '{"tab":"0","expression":"document.title"}'

# Bring tab to front
curl -X POST localhost:3456/focus -H 'Content-Type: application/json' -d '{"tab":"0"}'

# List tabs
curl localhost:3456/tabs

# Health check
curl localhost:3456/health
```

### Tab Targeting

All endpoints accept a `tab` field:
- `"0"` — by index
- `"github"` — partial URL/title match
- `"cdpn.io"` — matches cross-origin iframes too

---

## CLI Commands

The CLI is useful for quick manual operations and debugging.

```bash
node dist/browser.js list                    # List all open tabs
node dist/browser.js content <tab>           # Get text content from a tab
node dist/browser.js content <tab> -s "sel"  # Get text from specific CSS selector
node dist/browser.js content-all             # Get content from all tabs
node dist/browser.js elements <tab>          # List interactive elements
node dist/browser.js click <tab> <text>      # Click element by text
node dist/browser.js type <tab> <text>       # Type into input field
node dist/browser.js open <url>              # Navigate to URL
node dist/browser.js open <url> --new-tab    # Open in new tab
node dist/browser.js screenshot <tab> -o f   # Take screenshot
node dist/browser.js search <query>          # Search across all tabs
node dist/browser.js html <tab>              # Get full HTML of page
node dist/browser.js html <tab> -s "sel"     # Get HTML of specific element
node dist/browser.js desc <tab>              # Get item description from JSON-LD/meta
node dist/browser.js close <tab>             # Close a specific tab
node dist/browser.js close all               # Close all tabs except first
```

---

## Architecture

```
API Server (:3456)          CLI (node dist/browser.js)
    │                              │
    ├── src/api/recon.ts           ├── src/commands/*.ts
    ├── src/api/act.ts             │
    └── src/api/server.ts          │
         │                         │
         └─────────┬───────────────┘
                   ▼
           src/chrome/
           ├── connector.ts   (CDP connection)
           ├── tabs.ts        (tab discovery)
           └── content.ts     (content extraction)
                   │
                   ▼
           Chrome (:9222)
```

---

## Troubleshooting

**"Cannot connect to Chrome"**
- Ensure Chrome is running with `--remote-debugging-port=9222`
- Use a custom `--user-data-dir` (required for Chrome 136+)

**Elements not found**
- Always `/recon` first to see what's available
- Try partial text matching with `/click`
- Some elements are `role="option"` or `li` with `aria-label` — use selector from recon

**Form fields not filling**
- Use the API `/fill` endpoint — it uses real CDP keystrokes
- For SPAs, use `"submit": "enter"` instead of clicking submit buttons

**Links opening new tabs instead of navigating**
- The API `/click` handles `target="_blank"` automatically
- It overrides the target and navigates in the same tab

**Cross-origin iframes**
- Target them by their domain: `"tab": "cdpn.io"`
- CDP connects to iframes as separate targets

**Tab hidden behind other tabs**
- Use `/focus` to bring it to front
- `/navigate` does this automatically

**Too many tabs open**
- Use `close all` to close all but first tab
- Always clean up after tasks
