# surfagent

**Browser automation API for AI agents.** Give any AI agent the ability to see, navigate, and interact with real web pages through Chrome.

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
| `/click` | POST | Click by CSS selector or text match (handles `target="_blank"` automatically) |
| `/scroll` | POST | Scroll page, returns visible content preview and scroll position |
| `/navigate` | POST | Go to URL, back, or forward in the same tab |
| `/eval` | POST | Run JavaScript in any tab or cross-origin iframe |
| `/captcha` | POST | Detect and interact with captchas — Arkose, reCAPTCHA, hCaptcha (experimental) |
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
- Chrome (any recent version)
- Node.js 18+

## Contributing

Issues and PRs welcome at [github.com/AllAboutAI-YT/surfagent](https://github.com/AllAboutAI-YT/surfagent).

## License

MIT
