## IMPORTANT: Never kill Chrome

`surfagent` launches a **separate Chrome window** with its own profile. The user's personal Chrome stays untouched. NEVER run `pkill Chrome`, `killall Chrome`, or any command that kills Chrome processes. If you need to restart the debug session, use `surfagent start` — it will launch a new one without affecting anything.

---

## Critical Rule: Always Close Unused Tabs

After completing any task, close tabs you no longer need:
```bash
curl -X POST localhost:3456/click -H 'Content-Type: application/json' -d '{"tab":"0","text":"close"}' 
# Or via CLI:
node dist/browser.js close all
```

---

## Setup

### Start everything (one command)

```bash
surfagent start
```

This will:
1. Check if Chrome debug session is already running on port 9222
2. If not, launch a **new Chrome window** with a separate profile (`/tmp/surfagent-chrome`)
3. Copy cookies from the user's default Chrome profile (preserves logins)
4. Start the API server on `http://localhost:3456`

The user's personal Chrome browser is NOT affected. A second Chrome window will appear — this is the debug session that the API controls.

### Other commands

```bash
surfagent start     # Chrome + API (recommended)
surfagent chrome    # Launch Chrome debug session only
surfagent api       # Start API only (Chrome must already be running)
surfagent health    # Check if Chrome and API are running
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

# Captcha detection and interaction (experimental)
curl -X POST localhost:3456/captcha -H 'Content-Type: application/json' -d '{"tab":"0","action":"detect"}'

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
surfagent start
    │
    ├── Launches Chrome (separate window, separate profile)
    │   └── --remote-debugging-port=9222
    │       --user-data-dir=/tmp/surfagent-chrome
    │
    └── Starts API Server (:3456)
        │
        ├── src/api/recon.ts    (page reconnaissance)
        ├── src/api/act.ts      (fill, click, scroll, read, navigate, eval, captcha)
        └── src/api/server.ts   (HTTP routing)
             │
             └── src/chrome/    (CDP connection layer)
                  │
                  ▼
             Chrome (:9222)     ← separate window, user's Chrome untouched
```

---

## Troubleshooting

**"Cannot connect to Chrome"**
- Run `surfagent start` — it handles everything
- If Chrome is already running with debug mode, use `surfagent api` to just start the API

**A second Chrome window appeared**
- This is expected. `surfagent` runs its own Chrome with a separate profile. Your personal Chrome is not affected. Close the surfagent Chrome window when you're done.

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
