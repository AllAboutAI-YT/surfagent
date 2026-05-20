# surfagent

**Browser automation API for AI agents.** Give any AI agent the ability to see, navigate, and interact with real web pages through Chrome.

[![Demo](https://img.youtube.com/vi/tkDIdH62yq8/maxresdefault.jpg)](https://www.youtube.com/watch?v=tkDIdH62yq8)

`npm install -g surfagent` — two commands to give your agent a browser.

[![npm version](https://img.shields.io/npm/v/surfagent.svg)](https://www.npmjs.com/package/surfagent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

**surfagent** connects to a local Chrome browser via CDP and exposes a simple HTTP API that returns structured page data — every interactive element, form field, link, and CSS selector — so AI agents can navigate websites fast and precisely without screenshots or trial-and-error.

**Works with any AI agent framework:** LangChain, CrewAI, AutoGPT, Claude Code, OpenAI Agents, custom agents — anything that can make HTTP calls.

## Quick Start

```bash
npm install -g surfagent
surfagent start
```

A **new Chrome window** opens with debug mode — your personal Chrome is not affected. The API starts on `http://localhost:3456`.

## Why surfagent?

| Without surfagent | With surfagent |
|---|---|
| Agent takes screenshots, sends to vision model | Agent calls `/recon`, gets structured JSON in 30ms |
| Guesses CSS selectors, fails, retries | Gets exact selectors from recon response |
| Can't read forms, dropdowns, or modals | Gets form schemas with labels, types, required flags |
| Breaks on SPAs, iframes, shadow DOM | Handles all of them out of the box |
| Slow (2-5s per screenshot round-trip) | Fast (20-60ms per API call on existing tabs) |

## How Agents Use It

The workflow is: **recon → act → read**.

```
1. POST /recon   → get the page map (selectors, forms, elements)
2. POST /click   → click something using a selector from step 1
   POST /fill    → fill a form using selectors from step 1
3. POST /read    → check what happened (success? error? new content?)
4. POST /recon   → if the page changed, map it again
```

### Example: search on any website

```bash
# 1. Recon the page — find the search input
curl -X POST localhost:3456/recon -H 'Content-Type: application/json' \
  -d '{"tab":"0"}'
# Response includes: { "selector": "input[name='search']", "text": "Search..." }

# 2. Type and submit
curl -X POST localhost:3456/fill -H 'Content-Type: application/json' \
  -d '{"tab":"0", "fields":[{"selector":"input[name=\"search\"]","value":"AI agents"}], "submit":"enter"}'

# 3. Read the results
curl -X POST localhost:3456/read -H 'Content-Type: application/json' \
  -d '{"tab":"0"}'
```

## All Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/recon` | POST | Full page map — every element, form, selector, heading, nav link, metadata, captcha detection |
| `/read` | POST | Structured page content — headings, tables, code blocks, notifications, result areas |
| `/fill` | POST | Fill form fields with real CDP keystrokes (works with React, Vue, SPAs) |
| `/click` | POST | Click by selector or text, including dropdown options. Optional `waitAfter` for SPAs |
| `/dismiss` | POST | Auto-dismiss cookie banners, consent dialogs, modals (multi-language) |
| `/scroll` | POST | Scroll page, returns visible content preview and scroll position |
| `/navigate` | POST | Go to URL, back, or forward in the same tab |
| `/eval` | POST | Run JavaScript in any tab or cross-origin iframe |
| `/captcha` | POST | Detect and interact with captchas — Arkose, reCAPTCHA, hCaptcha (experimental) |
| `/type` | POST | Raw CDP key typing without clearing — for Google Sheets, contenteditable, canvas apps |
| `/focus` | POST | Bring a tab to the front in Chrome |
| `/tabs` | GET | List all open Chrome tabs |
| `/health` | GET | Check if Chrome and API are connected |

Full API reference with request/response schemas: **[API.md](./API.md)**

## Key Features

**Page reconnaissance** — one call returns every interactive element with stable CSS selectors, form schemas with field labels and validation, navigation structure, metadata, and content summary.

**Real keyboard input** — fills forms using CDP `Input.dispatchKeyEvent`, not JavaScript value injection. Works with React, Vue, Angular, and any framework-controlled inputs.

**Cross-origin iframe support** — target iframes by domain (`"tab": "stripe.com"`). CDP connects to them as separate targets, bypassing same-origin restrictions.

**SPA navigation** — handles single-page apps (YouTube, Gmail, Google Flights). Enter key submission, client-side routing, dynamic content — all work.

**Captcha detection** — `/recon` automatically detects captcha iframes (Arkose, reCAPTCHA, hCaptcha) and flags them. `/captcha` endpoint provides basic interaction.

**Overlay detection** — modals, cookie banners, and blocking overlays are detected and reported so agents can dismiss them before interacting.

**Same-tab navigation** — links with `target="_blank"` are automatically opened in the same tab instead of spawning new ones.

## Tab Targeting

Every endpoint accepts a `tab` field:

```json
{"tab": "0"}           // by index
{"tab": "github"}      // partial match on URL or title
{"tab": "stripe.com"}  // matches cross-origin iframes too
```

## Commands

```bash
surfagent start     # Start Chrome + API (one command)
surfagent chrome    # Start Chrome debug session only
surfagent api       # Start API only (Chrome must be running)
surfagent health    # Check if everything is running
surfagent help      # Show all options
```

## Tested On

Google Flights, YouTube, GitHub, Supabase, Hacker News, Reddit, CodePen, Polymarket, npm — including autocomplete dropdowns, date pickers, complex forms, SPA navigation, cross-origin iframes, and captchas.

## Platform Support

| Platform | Status |
|---|---|
| macOS | Fully supported |
| Linux | Fully supported |
| Windows | Not yet supported — coming soon |

## Requirements

- macOS or Linux
- Chrome or any Chromium-based browser (Arc, Brave, Edge, Vivaldi, etc.)
- Node.js 18+

### Using a non-Chrome browser

surfagent detects Chrome by default. For other Chromium-based browsers, set `BROWSER_PATH`:

```bash
# Arc
BROWSER_PATH="/Applications/Arc.app/Contents/MacOS/Arc" surfagent start

# Brave
BROWSER_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" surfagent start

# Microsoft Edge
BROWSER_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" surfagent start
```

## Stealth & Cadence (fork)

This fork (`Jeffdotchan/surfagent`, version `1.3.0-stealth.1+`) adds three layers on top of the
upstream `AllAboutAI-YT/surfagent`:

- **Stealth injection** (default on): on every new CDP target, surfagent injects a
  `Page.addScriptToEvaluateOnNewDocument` payload that masks `navigator.webdriver`, populates
  `chrome.runtime` / `chrome.app` / `chrome.csi` / `chrome.loadTimes`, restores
  `navigator.plugins` / `mimeTypes`, sets `navigator.languages`, wraps `navigator.permissions.query`,
  spoofs WebGL vendor/renderer, randomizes `hardwareConcurrency`, fixes `outerWidth/Height`, and
  patches media codec reporting. Evasions are vendored — not depended-on — from
  `puppeteer-extra-plugin-stealth` (MIT). See `LICENSE-evasions.txt`.
- **Click-timing jitter** (default on): every CDP-driven click sleeps a uniform-random interval
  before issuing. Default 80–400 ms (≈240 ms p50). Keystrokes get a tighter 30–120 ms range.
- **Mouse trajectory** (opt-in): a Bezier-curve mousemove path with small overshoot+return
  before the click. ~250 ms extra latency; enable per call via `--human-mouse` or
  `humanMouse: true` in the API body, or globally via `SURFAGENT_MOUSE_TRAJECTORY=1`.

### Env vars

| Variable | Default | Purpose |
|---|---|---|
| `SURFAGENT_STEALTH` | `1` | Set to `0` to disable stealth injection. |
| `SURFAGENT_CLICK_JITTER_MS` | `80,400` | `min,max` for click pre-pause. Set `0,0` to disable. |
| `SURFAGENT_TYPE_JITTER_MS` | `30,120` | `min,max` for per-keystroke pause. |
| `SURFAGENT_MOUSE_TRAJECTORY` | `0` | Set `1` to enable Bezier path on every click globally. |

### Per-call opt-in

CLI:

```bash
surfagent click 0 "Add to cart" --human-mouse
```

API:

```bash
curl -s http://localhost:3456/click -d '{"tab":"0","selector":".cta","humanMouse":true}'
```

### What this fork is NOT

Not in scope: `Runtime.evaluate` / `Function.prototype.toString` meta-patching, per-profile UA
randomization, cookie-jar warming, behavioral session replay. Each is its own future spec.

## Contributing

This is a fork. Upstream is [github.com/AllAboutAI-YT/surfagent](https://github.com/AllAboutAI-YT/surfagent);
fork-specific issues belong at [github.com/Jeffdotchan/surfagent](https://github.com/Jeffdotchan/surfagent).

## License

MIT (upstream + fork). Vendored evasion attribution in `LICENSE-evasions.txt`.
