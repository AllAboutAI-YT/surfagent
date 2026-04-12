# surfagent

A local API that gives AI agents structured page data from your Chrome browser. Instead of guessing selectors or taking screenshots, your agent gets a complete map of every element, form, and link on the page — then acts on it precisely.

**One recon call replaces dozens of trial-and-error clicks.**

## Quick Start

```bash
npm install -g surfagent
surfagent start
```

That's it. A **new Chrome window** opens with debug mode — your personal Chrome is not affected. The API starts on `http://localhost:3456` and your agent can start calling it immediately.

### Other commands

```bash
surfagent start     # Start Chrome + API (one command)
surfagent chrome    # Start Chrome debug session only
surfagent api       # Start API only (Chrome must be running)
surfagent health    # Check if everything is running
surfagent help      # Show all options
```

## Your First Recon

Open any website in Chrome, then:

```bash
curl -s -X POST localhost:3456/recon -d '{"tab":"0"}' -H 'Content-Type: application/json'
```

You get back:
- Every clickable element with a CSS selector
- Every form with field labels, types, and required flags
- Page headings, navigation links, metadata
- Overlay/modal detection

Your agent uses those selectors to interact — no guessing.

## What Can It Do?

### Map a page
```bash
# Get full page structure
curl -X POST localhost:3456/recon -H 'Content-Type: application/json' \
  -d '{"tab":"0"}'

# Open a URL and map it
curl -X POST localhost:3456/recon -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com", "keepTab": true}'
```

### Read page content
```bash
# Structured text — headings, tables, notifications
curl -X POST localhost:3456/read -H 'Content-Type: application/json' \
  -d '{"tab":"0"}'

# Read a specific element
curl -X POST localhost:3456/read -H 'Content-Type: application/json' \
  -d '{"tab":"0", "selector":".results"}'
```

### Fill forms
```bash
curl -X POST localhost:3456/fill -H 'Content-Type: application/json' \
  -d '{"tab":"0", "fields":[
    {"selector":"#email", "value":"me@example.com"},
    {"selector":"#password", "value":"secret"}
  ], "submit":"enter"}'
```

### Click elements
```bash
# By text
curl -X POST localhost:3456/click -H 'Content-Type: application/json' \
  -d '{"tab":"0", "text":"Sign In"}'

# By selector (from recon)
curl -X POST localhost:3456/click -H 'Content-Type: application/json' \
  -d '{"tab":"0", "selector":"#submit-btn"}'
```

### Navigate
```bash
# Go to URL (same tab)
curl -X POST localhost:3456/navigate -H 'Content-Type: application/json' \
  -d '{"tab":"0", "url":"https://example.com"}'

# Go back
curl -X POST localhost:3456/navigate -H 'Content-Type: application/json' \
  -d '{"tab":"0", "back":true}'
```

### Scroll
```bash
curl -X POST localhost:3456/scroll -H 'Content-Type: application/json' \
  -d '{"tab":"0", "direction":"down", "amount":1000}'
```

### Run JavaScript
```bash
curl -X POST localhost:3456/eval -H 'Content-Type: application/json' \
  -d '{"tab":"0", "expression":"document.title"}'
```

## All Endpoints

| Endpoint | Method | What it does |
|---|---|---|
| `/recon` | POST | Full page map — elements, forms, selectors, metadata |
| `/read` | POST | Structured page content — headings, tables, notifications |
| `/fill` | POST | Fill form fields with real keystrokes |
| `/click` | POST | Click by selector or text |
| `/scroll` | POST | Scroll with content preview |
| `/navigate` | POST | Go to URL, back, or forward (same tab) |
| `/eval` | POST | Run JavaScript in any tab or iframe |
| `/captcha` | POST | Detect captchas, basic interaction (experimental) |
| `/focus` | POST | Bring a tab to the front |
| `/tabs` | GET | List open tabs |
| `/health` | GET | Check Chrome connection |

Full API reference with response schemas: [API.md](./API.md)

## Tab Targeting

Every endpoint takes a `tab` field. You can target tabs three ways:

```json
{"tab": "0"}           // by index
{"tab": "github"}      // by URL or title (partial match)
{"tab": "cdpn.io"}     // cross-origin iframes work too
```

## How Agents Should Use This

The workflow is: **recon → act → read**.

```
1. /recon   → get the page map (selectors, forms, elements)
2. /click   → click something using a selector from step 1
   /fill    → fill a form using selectors from step 1
3. /read    → check what happened (success message? error? new content?)
4. /recon   → if the page changed, map it again
```

Agents never need to guess selectors or parse screenshots. The recon response has everything.

## Tested On

- Google Flights (autocomplete dropdowns, date pickers, complex forms)
- YouTube (SPA navigation, search, video selection)
- GitHub (login forms, repository pages)
- Supabase (dashboard navigation, SQL editor)
- Hacker News (link following, content reading)
- Reddit (thread navigation, comments)
- CodePen (cross-origin iframe interaction)
- Polymarket (market data extraction)

## Platform Support

| Platform | Status |
|---|---|
| macOS | Fully supported |
| Linux | Fully supported |
| Windows | Not yet supported — coming soon |

## Requirements

- macOS or Linux
- Chrome (any recent version)
- Node.js 18+

## License

MIT
