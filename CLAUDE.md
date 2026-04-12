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

---

## CLI Commands

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

## Tips for Element Detection

The `elements` command handles modern web apps with:
- Shadow DOM traversal
- React/Vue controlled inputs
- Visibility checking
- Interactive element detection (cursor: pointer, click handlers)

**Finding elements by text:**
```bash
# Exact match
node dist/browser.js click 0 "Submit"

# Partial match
node dist/browser.js click 0 "subm"

# CSS selector
node dist/browser.js click 0 "#submit-button"
```

**Typing into React inputs:**
```bash
node dist/browser.js type 0 "your text" -s "textarea"
node dist/browser.js type 0 "your text" -s "input"
```

---

## Extracting Data from Pages

**Get structured data from JSON-LD schema:**
```bash
node dist/browser.js desc 0
```

**Extract text from specific CSS selector:**
```bash
node dist/browser.js content 0 -s ".product-description"
node dist/browser.js content 0 -s "#price"
```

**Get raw HTML for debugging:**
```bash
node dist/browser.js html 0
node dist/browser.js html 0 -s ".seller-profile"
```

---

## Polymarket API Commands (No Auth Required)

Fast market data via public APIs — replaces screenshot-based signal reads.

```bash
node polymarket-api.cjs                      # Find current BTC 5-min market + orderbook + prices
node signal-reader.cjs                       # Run all 7 signals, get scored recommendation
node polymarket-ws.cjs                       # Stream real-time prices/trades/book updates
```

### Signal Reader Output

`signal-reader.cjs` scores 7 signals and outputs a recommendation:

1. **polymarket price** — up/down midpoint skew from CLOB API
2. **book depth** — bid size imbalance between up/down orderbooks
3. **trade flow** — recent buy-side flow direction
4. **btc momentum** — 3s binance price delta
5. **spread conviction** — tighter spread = more conviction
6. **large orders** — outsized trades ($30+) direction
7. **time decay** — window position modifier (early=fade, late=follow)

Recommendation: `UP` / `DOWN` / `LEAN UP` / `LEAN DOWN` / `SKIP` with confidence `high` / `medium` / `low`.

### API Architecture

```
Signal Pipeline (all public, no auth):
  polymarket-api.cjs ──→ orderbook, prices, trades, spread
  polymarket-ws.cjs  ──→ real-time price/trade stream
  btc-monitor.cjs    ──→ binance BTC price
  btc-liq-monitor.cjs──→ liquidation alerts
         │
         ▼
  signal-reader.cjs  ──→ unified signal report (7 signals scored)
         │
         ▼
  CDP scripts         ──→ trade execution (unchanged)
```

### Quick API Usage (from other scripts)

```javascript
const { findBTC5MinMarket, getOrderBook, getMarketSnapshot } = require('./polymarket-api.cjs');
const { readAllSignals } = require('./signal-reader.cjs');

// get everything at once
const snapshot = await getMarketSnapshot();
const signals = await readAllSignals();
```

---

## Troubleshooting

**"Cannot connect to Chrome"**
- Ensure Chrome is running with `--remote-debugging-port=9222`
- Use a custom `--user-data-dir` (required for Chrome 136+)

**Elements not found**
- Wait for page to fully load: `sleep 2`
- Use `elements` command to see what's available
- Try partial text matching

**Text not appearing in inputs**
- The `type` command handles React inputs
- Check that the selector matches: `-s "textarea"` or `-s "input"`

**Click not working**
- Use `elements` to find exact text
- Try clicking parent elements
- Some buttons may need direct URL navigation instead

**Too many tabs open**
- Use `close all` to close all but first tab
- Use `close <index>` to close specific tabs
- Always clean up after tasks