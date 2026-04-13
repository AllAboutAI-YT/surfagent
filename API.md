# Browser Recon API

Local API server that connects to a running Chrome debug session via CDP. It gives AI agents structured page data and interaction capabilities so they can navigate websites fast without trial and error.

**Base URL:** `http://localhost:3456`

**Requires:** Chrome running with `--remote-debugging-port=9222`

---

## Core Concept

The workflow is always: **recon first, then act.**

1. Call `/recon` to get a full map of the page — every interactive element, form field, navigation link, and CSS selector.
2. Use the selectors from the recon response to `/click`, `/fill`, `/scroll`, or `/eval`.
3. After navigation (clicking a link, submitting a form), call `/recon` again on the new page.

Never guess selectors. Always recon first.

---

## Endpoints

### POST /recon

Get a full structured map of a page. This is the primary endpoint — call it before interacting with any page.

**Request:**
```json
{ "url": "https://example.com" }
```
Opens the URL in a new tab, extracts everything, closes the tab.

```json
{ "url": "https://example.com", "keepTab": true }
```
Same but keeps the tab open for further interaction.

```json
{ "tab": "0" }
```
Recon an already-open tab by index.

```json
{ "tab": "github" }
```
Recon a tab by matching its URL or title (case-insensitive partial match).

```json
{ "tab": "cdpn.io" }
```
Recon a cross-origin iframe by matching its URL. Iframes are searched automatically when no page tab matches.

**Options:**
- `waitMs` (number) — milliseconds to wait after page load before extracting. Default: 2000. Increase for slow/heavy pages.

**Response:**
```json
{
  "url": "https://example.com",
  "title": "Page Title",
  "tabId": "ABC123",
  "timestamp": "2026-04-12T10:00:00.000Z",
  "meta": {
    "description": "Page description from meta tag",
    "ogTitle": "Open Graph title",
    "ogDescription": "Open Graph description",
    "jsonLd": []
  },
  "headings": [
    { "level": 1, "text": "Main Heading" },
    { "level": 2, "text": "Subheading" }
  ],
  "navigation": [
    { "text": "Home", "href": "https://example.com/", "section": "Main nav" }
  ],
  "elements": [
    {
      "tag": "BUTTON",
      "text": "Submit",
      "type": "submit",
      "href": null,
      "id": "submit-btn",
      "selector": "#submit-btn",
      "role": "button",
      "x": 400,
      "y": 300
    }
  ],
  "forms": [
    {
      "action": "https://example.com/login",
      "method": "POST",
      "id": "login-form",
      "fields": [
        {
          "tag": "input",
          "type": "text",
          "name": "username",
          "id": "user",
          "label": "Username",
          "placeholder": "Enter username",
          "required": true,
          "options": null,
          "selector": "#user"
        }
      ]
    }
  ],
  "landmarks": [
    { "role": "main", "label": null, "tag": "main" },
    { "role": "navigation", "label": "Main menu", "tag": "nav" }
  ],
  "contentSummary": "First 2000 chars of visible text...",
  "_reconMs": 2500
}
```

**Key fields for agents:**

- `elements[].selector` — use this in `/click`, `/fill`, and `/eval`. These are stable CSS selectors prioritizing `id`, `aria-label`, `data-testid`, and `name` attributes.
- `elements[].text` — human-readable label for the element. Use with `/click` text matching.
- `forms[].fields[].selector` — use these in `/fill` to fill form fields.
- `forms[].fields[].label` — tells you what each field is for.
- `forms[].fields[].required` — which fields must be filled before submitting.
- `forms[].fields[].options` — for `<select>` dropdowns, lists available options.
- `contentSummary` — quick read of page text without needing to parse elements.
- `overlays[]` — detected modals, dialogs, cookie banners, or blocking overlays. If non-empty, dismiss them before interacting with the page.
- `captchas[]` — detected captcha iframes (Arkose/FunCaptcha, reCAPTCHA, hCaptcha, OctoCaptcha). If non-empty, use `/captcha` to interact with them.

---

### POST /captcha (experimental)

Detect captcha iframes on a page and attempt basic interaction. Detection is reliable — interaction is best-effort and depends on the captcha type.

**Supported detection:** Arkose/FunCaptcha, reCAPTCHA, hCaptcha, OctoCaptcha, and generic captcha iframes.

**Supported interaction:** Currently tested with Arkose/FunCaptcha (image rotation). Other captcha types are detected but interaction may not work — they have different DOM structures and controls.

**Detect captchas on a page:**
```json
{ "tab": "0", "action": "detect" }
```

Response:
```json
{
  "captchas": [
    { "type": "octocaptcha", "src": "https://octocaptcha.com/...", "visible": true }
  ]
}
```

**Read captcha state:**
```json
{ "action": "read" }
```

Response:
```json
{
  "found": true,
  "instructions": "Rotate the image to match...",
  "buttons": ["Navigate to previous image", "Navigate to next image", "Audio", "Restart"]
}
```

**Interact:**
```json
{ "action": "next" }
```

Actions: `"next"`, `"prev"`, `"submit"`, `"audio"`, `"restart"`

Note: `detect` requires a `tab` field. Other actions auto-find the captcha iframe. If interaction fails for an unsupported captcha type, fall back to manual solving in the browser.

---

### POST /read

Get clean, structured readable content from a page. Use this instead of screenshots to understand what's on screen — it's faster (~20ms) and returns machine-readable text.

**Read full page:**
```json
{ "tab": "0" }
```

**Read specific element:**
```json
{ "tab": "0", "selector": ".results-grid" }
```

**Full page response:**
```json
{
  "title": "Page Title",
  "url": "https://example.com/dashboard",
  "sections": [
    { "type": "heading", "level": 1, "text": "Dashboard" },
    { "type": "p", "text": "Welcome back. You have 3 notifications." },
    { "type": "table", "rows": [["Name", "Status"], ["Project A", "Active"], ["Project B", "Paused"]] },
    { "type": "code", "text": "const api = new Client()" }
  ],
  "notifications": ["Changes saved successfully"],
  "resultText": "Output text from result/output areas if present",
  "plainText": "Full page text fallback (up to 4000 chars)..."
}
```

**Selector response:**
```json
{
  "tag": "DIV",
  "text": "Extracted text content of the element",
  "html": "<div>Raw HTML of the element</div>"
}
```

**When to use `/read` vs `/recon`:**
- `/recon` — before interacting. Gives you selectors, forms, elements to click/fill.
- `/read` — after an action. Tells you what happened — query results, page content, notifications, errors.

**Section types:** `heading`, `table`, `code`, `p`, `li`, `blockquote`. Tables are parsed into `rows` arrays. Code blocks preserve formatting.

---

### POST /dismiss

Dismiss cookie banners, consent dialogs, and modal overlays. Supports 15+ language patterns (English, Norwegian, German, French, Spanish, Italian, Portuguese).

```json
{ "tab": "0" }
```

Response:
```json
{ "dismissed": [{ "type": "cookie", "text": "reject all" }], "count": 1 }
```

If nothing was found to dismiss:
```json
{ "dismissed": [], "count": 0 }
```

---

### POST /focus

Bring a tab to the front in Chrome. Use this when a tab is behind other tabs or windows.

```json
{ "tab": "supabase" }
```

**Response:**
```json
{ "id": "ABC123", "title": "My Dashboard", "url": "https://example.com/dashboard" }
```

---

### POST /click

Click an element on a page.

**By selector** (preferred — use selectors from `/recon`):
```json
{ "tab": "0", "selector": "#submit-btn" }
```

**By text** (fuzzy match against visible text, including dropdown options):
```json
{ "tab": "0", "text": "Submit" }
```

**With wait** (wait for page to settle after click — useful for SPA navigation):
```json
{ "tab": "0", "text": "Search", "waitAfter": 2000 }
```

Text search matches: buttons, links, `role="option"`, `role="menuitem"`, `role="listitem"`, `li[aria-label]`, and elements with `onclick`. This means autocomplete dropdown items are clickable by text without needing `/eval`.

**Response:**
```json
{ "success": true, "clicked": "BUTTON: Submit" }
```

If the element is a link with `target="_blank"`, the click automatically navigates in the same tab instead of opening a new one. The response includes a `navigated` field:
```json
{ "success": true, "clicked": "A: View docs", "navigated": "https://docs.example.com" }
```

**Tab matching:** Same rules as `/recon` — index, URL/title match, or iframe URL match.

---

### POST /fill

Fill form fields using real CDP keyboard input. This simulates actual keystrokes, so it works with React, Vue, and other framework-controlled inputs.

**Request:**
```json
{
  "tab": "0",
  "fields": [
    { "selector": "#username", "value": "john@example.com" },
    { "selector": "#password", "value": "secret123" }
  ]
}
```

**With submit:**
```json
{
  "tab": "0",
  "fields": [
    { "selector": "input[name=\"search_query\"]", "value": "my search" }
  ],
  "submit": "enter"
}
```

**Submit options:**
- `"enter"` — press Enter key via CDP. Best option for single-page apps (SPAs).
- `"auto"` — finds and clicks the nearest `button[type="submit"]` or `input[type="submit"]`.
- `"#my-button"` — clicks a specific selector.

**Response:**
```json
{
  "filled": [
    { "selector": "#username", "success": true },
    { "selector": "#password", "success": true }
  ],
  "submitted": true,
  "_fillMs": 85
}
```

---

### POST /scroll

Scroll a page and get a preview of the visible content.

**Request:**
```json
{ "tab": "0", "direction": "down", "amount": 1000 }
```

- `direction` — `"down"` (default) or `"up"`
- `amount` — pixels to scroll. Default: 800.

**Response:**
```json
{
  "scrollY": 1000,
  "scrollHeight": 5000,
  "viewportHeight": 900,
  "atBottom": false,
  "contentPreview": "Text visible at the current scroll position..."
}
```

Use `scrollHeight` and `scrollY` to calculate progress. `atBottom` tells you when there's nothing more to scroll.

---

### POST /navigate

Navigate to a URL or go back/forward in history, all within the same tab. Automatically brings the tab to front.

**Go to URL:**
```json
{ "tab": "0", "url": "https://example.com" }
```

**Go back:**
```json
{ "tab": "0", "back": true }
```

**Go forward:**
```json
{ "tab": "0", "forward": true }
```

**Options:**
- `waitMs` (number) — wait time after navigation. Default: 2000.

**Response:**
```json
{ "url": "https://example.com", "title": "Example" }
```

---

### POST /eval

Run arbitrary JavaScript in any tab or iframe. Use this when the other endpoints don't cover your use case.

**On a page tab:**
```json
{ "tab": "0", "expression": "document.title" }
```

**Inside a cross-origin iframe:**
```json
{ "tab": "cdpn.io", "expression": "document.getElementById('btn').textContent = 'New Text'" }
```

**Response:**
```json
{ "result": "New Text" }
```

The expression is evaluated via `Runtime.evaluate` with `returnByValue: true`, so the result must be serializable (strings, numbers, objects, arrays — not DOM nodes).

---

### GET /tabs

List all open Chrome tabs.

**Response:**
```json
{
  "tabs": [
    { "id": "ABC123", "index": 0, "title": "Home", "url": "https://example.com" },
    { "id": "DEF456", "index": 1, "title": "Dashboard", "url": "https://example.com/dashboard" }
  ]
}
```

---

### GET /health

Check if the API can connect to Chrome.

**Response:**
```json
{ "status": "ok", "cdpConnected": true, "tabCount": 3 }
```

---

### POST /type

Raw CDP key typing without clearing the field first. Use this for apps like **Google Sheets**, contenteditable elements, or any context where `/fill`'s Ctrl+A clear step causes side effects (e.g., selecting all cells instead of clearing a field).

**Request:**
```json
{ "tab": "0", "keys": "Hello World", "submit": "tab" }
```

- `keys` (string) — characters to type via CDP `Input.dispatchKeyEvent`
- `submit` (optional) — `"enter"` or `"tab"` to press after typing

**Response:**
```json
{ "typed": 11, "submitted": true }
```

**Why not `/fill`?** The `/fill` endpoint focuses an element, does Ctrl+A + Backspace to clear it, then types. In Google Sheets, Ctrl+A selects all cells (not text in the current cell), wiping the entire sheet. `/type` skips the focus and clear — it types into whatever currently has focus.

---

## Tab Targeting

All POST endpoints accept a `tab` field. It resolves in this order:

1. **Index** — `"0"`, `"1"`, `"2"` — matches tab by position.
2. **URL/title match** — `"github"`, `"youtube"` — case-insensitive partial match against open tab URLs and titles.
3. **Iframe fallback** — if no page tab matches, searches iframe targets. Use this for cross-origin iframes like embedded editors, payment forms, or sandboxed previews.

---

## Patterns

### Handling a captcha (experimental)
```
1. POST /recon    { "tab": "0" }
   → Response includes captchas: [{"type": "arkose", ...}]
2. POST /captcha  { "action": "read" }
   → See available buttons — if empty, this captcha type may need manual solving
3. POST /captcha  { "action": "next" }
   → Interact with the captcha (repeat as needed)
4. POST /captcha  { "action": "submit" }
   → Submit the answer
5. POST /recon    { "tab": "0" }
   → Check if captcha is gone and page proceeded
```

### Login flow
```
1. POST /recon    { "url": "https://site.com/login", "keepTab": true }
   → Read forms[0].fields to find username/password selectors
2. POST /fill     { "tab": "0", "fields": [...], "submit": "enter" }
3. POST /recon    { "tab": "0" }
   → Verify login succeeded by checking title/content
```

### Search on a single-page app
```
1. POST /recon    { "tab": "0" }
   → Find the search input selector
2. POST /fill     { "tab": "0", "fields": [{ "selector": "...", "value": "query" }], "submit": "enter" }
3. POST /recon    { "tab": "0" }
   → Read results from elements[]
```

### Autocomplete / dropdown selection
```
1. POST /fill     { "tab": "0", "fields": [{ "selector": "input[aria-label='City']", "value": "London" }] }
   → Type text to trigger autocomplete
2. POST /recon    { "tab": "0" }
   → Find dropdown items (look for role="option" or li elements with aria-label)
3. POST /click    { "tab": "0", "selector": "li[aria-label='London, United Kingdom']" }
   → Select the correct option
```

### Acting then reading the result
```
1. POST /click    { "tab": "0", "text": "Submit" }
   → Trigger an action (form submit, button click, etc.)
2. POST /read     { "tab": "0" }
   → Check what happened — notifications[] for success/error, sections[] for updated content
3. POST /read     { "tab": "0", "selector": ".results" }
   → Or read a specific area of the page for targeted feedback
```

### Reading a long page
```
1. POST /recon    { "tab": "0" }
   → Get headings and contentSummary for overview
2. POST /scroll   { "tab": "0", "direction": "down", "amount": 2000 }
   → Read contentPreview at each position
3. Repeat until atBottom is true
```

### Reading a specific part of the page
```
POST /read  { "tab": "0", "selector": "#main-content" }
→ Returns text and html of that element — useful for tables, output areas, sidebars
```

### Following links across pages (same tab)
```
1. POST /recon    { "tab": "0" }
   → Find the link in elements[]
2. POST /click    { "tab": "0", "text": "Article Title" }
   → Navigates in same tab (handles target="_blank" automatically)
3. POST /recon    { "tab": "0" }
   → Map the new page
```

### Interacting inside a cross-origin iframe
```
1. POST /recon    { "tab": "0" }
   → See the parent page (iframe content won't be visible here)
2. POST /recon    { "tab": "iframe-domain.com" }
   → Recon inside the iframe — get its elements and selectors
3. POST /fill     { "tab": "iframe-domain.com", "fields": [...] }
   → Fill fields inside the iframe
4. POST /click    { "tab": "iframe-domain.com", "selector": "#submit" }
   → Click inside the iframe
```

### Google Sheets workflow

Google Sheets requires a special approach because `/fill` uses Ctrl+A to clear fields, which selects all cells in Sheets. Use the **name box + `/type`** pattern instead.

**Navigate to a cell:** Use `/fill` on the name box (`#t-name-box`), then Enter to jump to the cell.

**Type into a cell:** Use `/type` with `"submit": "tab"` (moves to next cell) or `"submit": "enter"` (moves down).

```
1. POST /click    { "tab": "sheets", "selector": "#t-name-box" }
   → Focus the name box
2. POST /fill     { "tab": "sheets", "fields": [{ "selector": "#t-name-box", "value": "A1", "clear": true }], "submit": "enter" }
   → Navigate to cell A1
3. POST /type     { "tab": "sheets", "keys": "Hello World", "submit": "tab" }
   → Type into A1, Tab moves to B1
4. POST /type     { "tab": "sheets", "keys": "=SUM(A1:A10)", "submit": "enter" }
   → Type a formula, Enter commits and moves down
```

**Adding a new sheet tab:** The "+" button at the bottom does not respond to DOM `.click()`. Use CDP `Input.dispatchMouseEvent` at the button's coordinates:

```bash
# Get the Add Sheet button position
curl -s -X POST localhost:3456/eval -d '{"tab":"0","expression":"var els = document.querySelectorAll(\"div[data-tooltip]\"); var r = \"\"; for(var i=0;i<els.length;i++){if(els[i].dataset.tooltip===\"Add Sheet\"){var b=els[i].getBoundingClientRect(); r=b.x+\",\"+b.y+\",\"+b.width+\",\"+b.height}} r"}'
# Returns: "44,854,34,34"

# Click it with a Node script using CDP mouse events
node -e "
const CDP = require('chrome-remote-interface');
(async () => {
  const targets = await CDP.List({port: 9222});
  const tab = targets.find(t => t.url.includes('docs.google.com'));
  const client = await CDP({target: tab, port: 9222});
  await client.Input.dispatchMouseEvent({type:'mousePressed', x:61, y:871, button:'left', clickCount:1});
  await client.Input.dispatchMouseEvent({type:'mouseReleased', x:61, y:871, button:'left', clickCount:1});
  await client.close();
})();
"
```

**Renaming a sheet tab:** Double-click the tab name via CDP mouse events at the tab's coordinates, then use `/type` to enter the new name and press Enter.

**Using the menu search:** Google Sheets has a menu search box (`input[aria-label="Menus"]` or `input[aria-label="Menus (Option+/)"]`). Use `/fill` to type a command (e.g., "Insert chart"), then `/click` on the matching result.

**Key gotchas:**
- Never use `/fill` directly on Google Sheets cells — it will wipe data via Ctrl+A
- Always navigate to a cell via the name box first, then `/type`
- Some buttons (Add Sheet, menu items) only respond to CDP mouse events, not DOM clicks
- Navigating away from unsaved Sheets triggers a native Chrome dialog — see the "Native Chrome Dialogs" section below

### CDP mouse clicks for unreachable elements

Some UI elements don't respond to JavaScript `.click()` or the `/click` endpoint — they only react to real mouse events at their coordinates. This is common for:
- Google Sheets buttons (Add Sheet, toolbar items)
- Canvas-rendered elements
- Custom widgets that listen for `mousedown`/`mouseup` events

**Pattern:**
```bash
# 1. Get the element's coordinates via /eval
curl -s -X POST localhost:3456/eval -d '{"tab":"0","expression":"document.querySelector(\"#my-button\").getBoundingClientRect().x"}'
# → {"result": 100}

# 2. Click via CDP Input.dispatchMouseEvent (requires a Node script)
node -e "
const CDP = require('chrome-remote-interface');
(async () => {
  const targets = await CDP.List({port: 9222});
  const tab = targets.find(t => t.url.includes('your-site'));
  const client = await CDP({target: tab, port: 9222});
  await client.Input.dispatchMouseEvent({type:'mousePressed', x:100, y:200, button:'left', clickCount:1});
  await client.Input.dispatchMouseEvent({type:'mouseReleased', x:100, y:200, button:'left', clickCount:1});
  await client.close();
})();
"
```

**Double-click** (e.g., to rename a Google Sheets tab): use `clickCount: 2`.

---

## Native Chrome Dialogs (Not in DOM or CDP)

Chrome can show browser-level popups — like "Leave page?" (`beforeunload`) dialogs — that are **not in the DOM**, **not accessible via CDP**, and will **block all CDP commands** (`/eval`, `/recon`, `/read` will all hang or timeout).

**Symptoms of a stuck session:**
- API calls hang or timeout on a tab that was previously working
- `Page.handleJavaScriptDialog` returns "No dialog is showing" (because it's not a JS dialog — it's a native Chrome window)
- The agent appears frozen on a page

**How to detect it (macOS only):**

Use CoreGraphics to list windows belonging to the surfagent Chrome process. Native dialogs appear as small unnamed windows (~260x218px) that are not visible to CDP.

```bash
# 1. Find the surfagent Chrome PID
SURFAGENT_PID=$(ps aux | grep 'chrome.*surfagent' | grep -v grep | awk '{print $2}')

# 2. List all windows for that PID using CoreGraphics
swift -e "
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    let pid = w[\"kCGWindowOwnerPID\"] as? Int ?? 0
    if pid == ${SURFAGENT_PID} {
        let name = w[\"kCGWindowName\"] as? String ?? \"(unnamed)\"
        let bounds = w[\"kCGWindowBounds\"] as? [String: Any] ?? [:]
        let width = bounds[\"Width\"] as? Int ?? 0
        let height = bounds[\"Height\"] as? Int ?? 0
        if width > 100 && height > 100 {
            print(\"Window: \(name) | Size: \(width)x\(height)\")
        }
    }
}
"
```

**What to look for:** A small unnamed window (typically ~260x218) alongside the main browser window. That's the native dialog.

**How to dismiss it:**

Native Chrome dialogs cannot be dismissed via CDP or AppleScript's `tell process "Google Chrome"` (which only sees the personal Chrome, not the surfagent debug instance). You must use the **Swift Accessibility API targeting the surfagent PID directly**.

```bash
# Find the surfagent Chrome PID
SURFAGENT_PID=$(ps aux | grep 'chrome.*surfagent' | grep -v grep | awk '{print $2}')

# Click "Cancel" (stay on page) — or change "Avbryt"/"Cancel" to "Leave"/"Gå ut" to leave
swift -e "
import Cocoa

let pid: pid_t = ${SURFAGENT_PID}
let app = AXUIElementCreateApplication(pid)

var windowsRef: CFTypeRef?
AXUIElementCopyAttributeValue(app, \"AXWindows\" as CFString, &windowsRef)

if let windows = windowsRef as? [AXUIElement] {
    for win in windows {
        var subroleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(win, \"AXSubrole\" as CFString, &subroleRef)
        let subrole = subroleRef as? String ?? \"\"
        
        // Native dialogs have subrole AXDialog
        if subrole == \"AXDialog\" {
            var childrenRef: CFTypeRef?
            AXUIElementCopyAttributeValue(win, \"AXChildren\" as CFString, &childrenRef)
            if let children = childrenRef as? [AXUIElement] {
                for child in children {
                    var roleRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(child, \"AXRole\" as CFString, &roleRef)
                    var titleRef: CFTypeRef?
                    AXUIElementCopyAttributeValue(child, \"AXTitle\" as CFString, &titleRef)
                    let role = roleRef as? String ?? \"\"
                    let title = titleRef as? String ?? \"\"
                    
                    // Match button by title — handles multiple languages
                    // Cancel/Stay: \"Cancel\", \"Avbryt\" (Norwegian)
                    // Leave: \"Leave\", \"Gå ut\" (Norwegian)
                    let cancelNames = [\"Cancel\", \"Avbryt\"]
                    let leaveNames = [\"Leave\", \"Gå ut\"]
                    
                    let targetNames = cancelNames  // Change to leaveNames to leave
                    
                    if role == \"AXButton\" && targetNames.contains(title) {
                        let result = AXUIElementPerformAction(child, \"AXPress\" as CFString)
                        print(\"Clicked \(title): \(result == .success ? \"SUCCESS\" : \"FAILED\")\")
                    }
                }
            }
        }
    }
}
"
```

**Why AppleScript doesn't work:** `tell process "Google Chrome"` sees all Chrome instances as one process, but only exposes the *personal* Chrome's windows. The surfagent Chrome (launched with `--user-data-dir=/tmp/surfagent-chrome`) is invisible to it. The Swift `AXUIElementCreateApplication(pid)` approach targets the exact process by PID, which is the only way to reach the surfagent Chrome's native dialogs.

**When to check:** If any API call hangs or times out unexpectedly on a tab that was previously responsive, check for a native dialog before retrying. Common triggers:
- Navigating away from pages with unsaved changes (Google Sheets, web editors, forms)
- `window.onbeforeunload` handlers
- Chrome permission prompts

**Decision logic for agents:**
- **Click "Leave"** if you intentionally navigated away and don't need the page anymore
- **Click "Cancel"** if the navigation was accidental and you want to keep working on the current page (e.g., Google Sheets with unsaved data)

---

## Important Notes

- **Always recon before acting.** The selectors you need come from the recon response.
- **Recon on existing tabs is fast** (~20-60ms). Recon with a new URL takes 2-4 seconds due to page load.
- **After clicking a link**, recon again — the page has changed and old selectors are stale.
- **For single-page apps**, use `"submit": "enter"` instead of clicking submit buttons. SPA buttons often don't respond to JavaScript `.click()`.
- **For autocomplete fields**, type the value with `/fill` (no submit), then `/recon` to find dropdown options, then `/click` the correct option by `aria-label` selector.
- **Date pickers** often use `data-iso` or `data-date` attributes. Use `/recon` to find them, then `/click` with the selector like `[data-iso="2026-05-15"]`.
- **Cross-origin iframes** are accessible by targeting their domain in the `tab` field. CDP connects to them as separate targets, bypassing same-origin restrictions.
- **Use `/read` after actions** to understand what happened — query results, success/error messages, page state changes. It's faster than screenshots and returns structured data.
- **Use `/focus`** if a tab is hidden behind other tabs or windows. `/navigate` does this automatically, but `/focus` is useful when you just need to bring an existing tab forward.
- **The `/eval` endpoint** is for edge cases — use it when you need to call page-specific JavaScript APIs, read computed styles, or manipulate the DOM in ways not covered by other endpoints.
- **Overlay detection**: `/recon` includes an `overlays[]` field that detects modals, dialogs, and cookie banners blocking the page. Dismiss them before interacting.
