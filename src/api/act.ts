import CDP from 'chrome-remote-interface';
import { connectToTab, CDPClient } from '../chrome/connector.js';
import { findTab, getAllTabs, TabInfo } from '../chrome/tabs.js';

async function resolveTab(tabPattern: string, port: number, host: string): Promise<TabInfo> {
  const tabs = await getAllTabs(port, host);
  const index = parseInt(tabPattern, 10);
  let tab = !isNaN(index) && index >= 0 && index < tabs.length ? tabs[index] : null;
  if (!tab) {
    const lower = tabPattern.toLowerCase();
    tab = tabs.find(t => t.url.toLowerCase().includes(lower) || t.title.toLowerCase().includes(lower)) || null;
  }

  // Fall back to iframe targets
  if (!tab) {
    const allTargets = await CDP.List({ port, host });
    const lower = tabPattern.toLowerCase();
    const iframeTarget = allTargets.find((t: any) => t.type === 'iframe' &&
      (t.url.toLowerCase().includes(lower) || (t.title || '').toLowerCase().includes(lower)));
    if (iframeTarget) {
      return { id: iframeTarget.id, index: -1, title: iframeTarget.title || '', url: iframeTarget.url };
    }
  }

  if (!tab) throw new Error(`Tab not found: ${tabPattern.length > 100 ? tabPattern.substring(0, 100) + '...' : tabPattern}`);
  return tab;
}

export interface FillField {
  selector: string;
  value: string;
}

export interface FillRequest {
  tab: string;
  fields: FillField[];
  submit?: string; // selector for submit button, or true to auto-find
}

export interface FillResult {
  filled: { selector: string; success: boolean; error?: string }[];
  submitted?: boolean;
}

export async function fillFields(
  request: FillRequest,
  options: { port?: number; host?: string }
): Promise<FillResult> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  const tab = await resolveTab(request.tab, port, host);
  const client = await connectToTab(tab.id, port, host);
  const cdp = client as any;

  // Enable Input domain for dispatching key events
  try { await cdp.Input?.enable?.(); } catch {}

  const results: FillResult['filled'] = [];

  for (const field of request.fields) {
    try {
      // Detect element type to choose fill strategy
      const elInfo = await client.Runtime.evaluate({
        expression: `(function() {
          const el = document.querySelector(${JSON.stringify(field.selector)});
          if (!el) return { found: false };
          return {
            found: true,
            tag: el.tagName,
            type: el.type || null,
            contentEditable: el.isContentEditable || false,
            maxLength: el.maxLength >= 0 ? el.maxLength : null
          };
        })()`,
        returnByValue: true
      });
      const info = elInfo.result.value as any;
      if (!info || !info.found) {
        results.push({ selector: field.selector, success: false, error: `Element not found: ${field.selector}` });
        continue;
      }

      const isDateTimeRange = ['date', 'time', 'datetime-local', 'month', 'week', 'range', 'color'].includes(info.type);
      const isContentEditable = info.contentEditable && info.tag !== 'INPUT' && info.tag !== 'TEXTAREA';

      if (isDateTimeRange) {
        // Date/time/range inputs: set value programmatically + dispatch events
        await client.Runtime.evaluate({
          expression: `(function() {
            const el = document.querySelector(${JSON.stringify(field.selector)});
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(el, ${JSON.stringify(field.value)});
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })()`,
          returnByValue: true
        });
      } else {
        // Focus and clear
        await client.Runtime.evaluate({
          expression: `
            (function() {
              const el = document.querySelector(${JSON.stringify(field.selector)});
              el.focus();
              el.click();
              if (el.select) el.select();
              else if (el.setSelectionRange) el.setSelectionRange(0, el.value?.length || 0);
            })()
          `,
          returnByValue: true
        });

        // Clear existing value with select-all + delete
        await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
        await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
        await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace', code: 'Backspace' });
        await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace', code: 'Backspace' });

        // Type each character via CDP Input.dispatchKeyEvent
        for (const char of field.value) {
          if (char === '\n') {
            await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
            await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
          } else if (char === '\t') {
            await client.Runtime.evaluate({ expression: `document.execCommand('insertText', false, '\\t')` });
          } else {
            await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: char, text: char });
            await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: char });
          }
        }
      }

      // Verify: use value for inputs, textContent for contenteditable
      const verifyExpr = isContentEditable
        ? `document.querySelector(${JSON.stringify(field.selector)})?.textContent?.trim()`
        : `document.querySelector(${JSON.stringify(field.selector)})?.value`;
      const verify = await client.Runtime.evaluate({ expression: verifyExpr, returnByValue: true });

      const actual = verify.result.value as string;
      if (actual === field.value) {
        results.push({ selector: field.selector, success: true });
      } else if (actual === undefined || actual === null) {
        results.push({ selector: field.selector, success: false, error: `Element not found or has no value: ${field.selector}` });
      } else if (info.maxLength && actual === field.value.substring(0, info.maxLength)) {
        // Maxlength truncation — fill worked within constraint
        results.push({ selector: field.selector, success: true, error: `Truncated to maxlength=${info.maxLength}` });
      } else if (isContentEditable && actual.includes(field.value)) {
        results.push({ selector: field.selector, success: true });
      } else {
        results.push({ selector: field.selector, success: false, error: `Value mismatch: expected "${field.value}", got "${actual}"` });
      }
    } catch (error) {
      results.push({ selector: field.selector, success: false, error: (error as Error).message });
    }
  }

  // Handle submit
  let submitted = false;
  if (request.submit) {
    try {
      if (request.submit === 'enter') {
        // Press Enter via CDP — works on SPAs like YouTube
        await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      } else {
        const submitSelector = request.submit === 'auto'
          ? 'button[type="submit"], input[type="submit"]'
          : request.submit;

        await client.Runtime.evaluate({
          expression: `
            (function() {
              const el = document.querySelector(${JSON.stringify(submitSelector)});
              if (!el) throw new Error('Submit button not found');
              el.click();
            })()
          `,
          returnByValue: true
        });
      }
      submitted = true;
    } catch {}
  }

  await client.close();
  return { filled: results, submitted };
}

export interface ClickRequest {
  tab: string;
  selector?: string;
  text?: string;
  waitAfter?: number; // ms to wait after click for page to settle
}

export async function clickElement(
  request: ClickRequest,
  options: { port?: number; host?: string }
): Promise<{ success: boolean; clicked?: string; error?: string }> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  const tab = await resolveTab(request.tab, port, host);
  const client = await connectToTab(tab.id, port, host);

  try {
    const result = await client.Runtime.evaluate({
      expression: `
        (function() {
          let el;
          const selector = ${JSON.stringify(request.selector || null)};
          const text = ${JSON.stringify(request.text || null)};

          if (selector) {
            el = document.querySelector(selector);
          }
          if (!el && text) {
            const lower = text.toLowerCase();
            const all = document.querySelectorAll('a, button, input[type="submit"], [role="button"], [role="option"], [role="menuitem"], [role="listitem"], [role="tab"], [role="link"], li[aria-label], [onclick], label');
            let bestMatch = null;
            let bestScore = Infinity; // lower is better
            for (const candidate of all) {
              const t = (candidate.innerText || candidate.textContent || candidate.value || candidate.getAttribute('aria-label') || '').trim();
              const tLower = t.toLowerCase();
              if (!tLower.includes(lower)) continue;
              // Score: 0 = exact, 1 = starts-with, 2+ = contains (shorter text = better)
              let score;
              if (tLower === lower) score = 0;
              else if (tLower.startsWith(lower)) score = 1;
              else score = 2 + t.length;
              if (score < bestScore) { bestMatch = candidate; bestScore = score; }
              if (score === 0) break; // exact match, stop
            }
            el = bestMatch;
          }
          if (!el) return { success: false, error: 'Element not found' };
          if (el.disabled || el.getAttribute('aria-disabled') === 'true') return { success: false, error: 'Element is disabled' };

          el.scrollIntoView({ block: 'center' });

          // If it's a link with target="_blank", navigate in same tab instead
          if (el.tagName === 'A' && el.getAttribute('target') === '_blank' && el.href) {
            const href = el.href;
            el.removeAttribute('target');
            window.location.href = href;
            return { success: true, clicked: el.tagName + ': ' + (el.innerText || el.value || '').trim().substring(0, 80), navigated: href };
          }

          el.click();
          return { success: true, clicked: el.tagName + ': ' + (el.innerText || el.value || '').trim().substring(0, 80) };
        })()
      `,
      returnByValue: true
    });

    // Wait after click if requested (for page to settle after navigation/SPA route change)
    if (request.waitAfter && request.waitAfter > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, Math.min(request.waitAfter!, 10000)));
    }

    await client.close();
    return result.result.value as any;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export interface ScrollRequest {
  tab: string;
  direction?: 'down' | 'up';
  amount?: number; // pixels, default 800
}

export async function scrollPage(
  request: ScrollRequest,
  options: { port?: number; host?: string }
): Promise<{ scrollY: number; scrollHeight: number; viewportHeight: number; atBottom: boolean; contentPreview: string }> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';
  const direction = request.direction || 'down';
  const amount = request.amount || 800;

  const tab = await resolveTab(request.tab, port, host);
  const client = await connectToTab(tab.id, port, host);

  try {
    const result = await client.Runtime.evaluate({
      expression: `
        (function() {
          const delta = ${direction === 'up' ? -amount : amount};
          window.scrollBy(0, delta);

          // Wait a tick for scroll to settle
          const scrollY = Math.round(window.scrollY);
          const scrollHeight = document.documentElement.scrollHeight;
          const viewportHeight = window.innerHeight;
          const atBottom = (scrollY + viewportHeight) >= (scrollHeight - 2);

          // Get visible text content from elements in the current viewport
          let contentPreview = '';
          const visibleTexts = [];
          const mainEl = document.querySelector('main, article, [role="main"]') || document.body;
          const allEls = mainEl.querySelectorAll('p, li, td, th, h1, h2, h3, h4, h5, h6, dd, dt, blockquote, pre');
          for (const el of allEls) {
            if (visibleTexts.length >= 30) break;
            const rect = el.getBoundingClientRect();
            // Element must be within the viewport
            if (rect.bottom < 0 || rect.top > viewportHeight || rect.height === 0) continue;
            // Skip fixed/sticky elements (nav, TOC, sidebars)
            const style = window.getComputedStyle(el.closest('nav, aside, [role="navigation"]') || el);
            if (style.position === 'fixed' || style.position === 'sticky') continue;
            const text = el.innerText?.trim();
            if (!text || text.length < 5) continue;
            // Skip if text is too long (likely a parent container)
            if (text.length > 500) continue;
            // Skip duplicates
            if (visibleTexts.some(t => t.includes(text) || text.includes(t))) continue;
            visibleTexts.push(text);
          }
          contentPreview = visibleTexts.join('\\n').substring(0, 1500);
          if (!contentPreview) {
            // Fallback: grab from center point
            const elements = document.elementsFromPoint(window.innerWidth / 2, viewportHeight / 2);
            for (const el of elements) {
              const text = el.innerText?.trim();
              if (text && text.length > 50 && text.length < 3000) {
                contentPreview = text.substring(0, 1500);
                break;
              }
            }
          }

          return { scrollY, scrollHeight, viewportHeight, atBottom, contentPreview };
        })()
      `,
      returnByValue: true
    });

    await client.close();
    return result.result.value as any;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export interface NavigateRequest {
  tab: string;
  url?: string;
  back?: boolean;
  forward?: boolean;
  waitMs?: number;
}

export async function navigatePage(
  request: NavigateRequest,
  options: { port?: number; host?: string }
): Promise<{ url: string; title: string }> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';
  const waitMs = request.waitMs || 2000;

  const tab = await resolveTab(request.tab, port, host);
  const client = await connectToTab(tab.id, port, host);

  try {
    // Always bring tab to front
    await (client.Page as any).bringToFront();

    if (request.back) {
      await client.Runtime.evaluate({ expression: 'window.history.back()' });
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } else if (request.forward) {
      await client.Runtime.evaluate({ expression: 'window.history.forward()' });
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } else if (request.url) {
      // Block dangerous URL schemes
      const scheme = request.url.trim().toLowerCase().split(':')[0];
      if (['javascript', 'vbscript'].includes(scheme)) {
        await client.close();
        throw new Error('Blocked: javascript: URLs are not allowed');
      }
      await (client.Page as any).navigate({ url: request.url });
      // Race loadEventFired against a timeout to prevent hanging on non-loading URLs
      const loadTimeout = new Promise<void>(resolve => setTimeout(resolve, Math.min(waitMs + 10000, 30000)));
      await Promise.race([(client.Page as any).loadEventFired(), loadTimeout]);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    const result = await client.Runtime.evaluate({
      expression: 'JSON.stringify({ url: window.location.href, title: document.title })',
      returnByValue: true
    });

    await client.close();
    return JSON.parse(result.result.value as string);
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function evalInTab(
  tab: string,
  expression: string,
  options: { port?: number; host?: string }
): Promise<any> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  const resolved = await resolveTab(tab, port, host);
  const client = await connectToTab(resolved.id, port, host);

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Eval timed out after 30s')), 30000)
    );
    const evalPromise = client.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    const result = await Promise.race([evalPromise, timeout]);
    // Check for exceptions (syntax errors, thrown errors, etc.)
    if (result.exceptionDetails) {
      const desc = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Unknown error';
      await client.close();
      return { __error: desc };
    }
    await client.close();
    return result.result.value ?? null;
  } catch (error) {
    await client.close();
    throw error;
  }
}

const READ_SCRIPT = `
(function() {
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  const title = document.title;
  const url = window.location.href;

  // Get structured content from main/article or body
  const mainEl = document.querySelector('main, article, [role="main"]') || document.body;
  const clone = mainEl.cloneNode(true);
  clone.querySelectorAll('script,style,noscript,svg,nav,header,footer,[role="navigation"],[aria-hidden="true"]').forEach(e => e.remove());

  // Build structured text with semantic markers
  const sections = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, null);
  let node;
  while (node = walker.nextNode()) {
    const tag = node.tagName?.toLowerCase();
    const text = node.innerText?.trim();
    if (!text) continue;

    if (/^h[1-6]$/.test(tag)) {
      sections.push({ type: 'heading', level: parseInt(tag[1]), text: text.substring(0, 200) });
    } else if (tag === 'table') {
      // Extract table as rows
      const rows = [];
      for (const tr of node.querySelectorAll('tr')) {
        const cells = Array.from(tr.querySelectorAll('th,td')).map(c => c.innerText?.trim()).filter(Boolean);
        if (cells.length) rows.push(cells);
      }
      if (rows.length) sections.push({ type: 'table', rows: rows.slice(0, 50) });
      walker.nextNode(); // skip children
    } else if (tag === 'pre' || tag === 'code') {
      sections.push({ type: 'code', text: text.substring(0, 1000) });
    } else if (tag === 'p' || tag === 'li' || tag === 'dd' || tag === 'blockquote') {
      if (text.length > 10) sections.push({ type: tag, text: text.substring(0, 500) });
    }
  }

  // Notifications / alerts / toasts
  const notifications = [];
  for (const el of document.querySelectorAll('[role="alert"], [role="status"], .toast, .notification, .alert, [class*="toast"], [class*="notification"]')) {
    if (!isVisible(el)) continue;
    const text = el.innerText?.trim();
    if (text && text.length > 3) notifications.push(text.substring(0, 200));
  }

  // Results area - common patterns for query results, tables, output
  const resultEl = document.querySelector('[class*="result"], [class*="output"], [data-testid*="result"], .cm-content');
  const resultText = resultEl?.innerText?.trim()?.substring(0, 2000) || null;

  // Plain text fallback
  const plainText = (clone.innerText || '').trim().substring(0, 4000);

  return { title, url, sections: sections.slice(0, 100), notifications, resultText, plainText };
})()
`;

export async function readPage(
  tabPattern: string,
  options: { port?: number; host?: string; selector?: string }
): Promise<any> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  const tab = await resolveTab(tabPattern, port, host);
  const client = await connectToTab(tab.id, port, host);

  try {
    let result;
    if (options.selector) {
      // Read specific element
      const r = await client.Runtime.evaluate({
        expression: `(function(){ const el = document.querySelector(${JSON.stringify(options.selector)}); if (!el) return { error: 'not found' }; return { tag: el.tagName, text: el.innerText?.trim()?.substring(0, 5000), html: el.innerHTML?.substring(0, 5000) } })()`,
        returnByValue: true
      });
      result = r.result.value;
    } else {
      const r = await client.Runtime.evaluate({
        expression: READ_SCRIPT,
        returnByValue: true
      });
      result = r.result.value;
    }

    await client.close();
    return result;
  } catch (error) {
    await client.close();
    throw error;
  }
}

const DISMISS_OVERLAYS_SCRIPT = `
(function() {
  const dismissed = [];

  // Common cookie consent button patterns (multi-language)
  const consentPatterns = [
    'reject all', 'reject', 'decline', 'deny',
    'accept all', 'accept', 'godta alle', 'godta',
    'alle ablehnen', 'ablehnen', 'tout refuser', 'refuser',
    'rechazar todo', 'rechazar', 'rifiuta tutto', 'rifiuta',
    'bare nødvendige', 'only necessary', 'nur notwendige',
    'manage preferences', 'cookie settings',
  ];

  // Try cookie consent buttons
  for (const btn of document.querySelectorAll('button, a[role="button"]')) {
    const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
    if (text.length > 50 || text.length < 2) continue;
    for (const pattern of consentPatterns) {
      if (text === pattern || text.startsWith(pattern)) {
        btn.click();
        dismissed.push({ type: 'cookie', text: text.substring(0, 40) });
        break;
      }
    }
    if (dismissed.length) break;
  }

  // Try closing modal dialogs (X button, close button, dismiss)
  if (!dismissed.length) {
    for (const btn of document.querySelectorAll('[aria-label*="Close" i], [aria-label*="Dismiss" i], [aria-label*="Lukk" i], [aria-label*="Schließen" i], [aria-label*="Fermer" i]')) {
      const dialog = btn.closest('[role="dialog"], [role="alertdialog"], .modal, [data-overlay]');
      if (dialog) {
        btn.click();
        dismissed.push({ type: 'dialog', text: btn.getAttribute('aria-label') || 'close' });
        break;
      }
    }
  }

  return { dismissed, count: dismissed.length };
})()
`;

export async function dismissOverlays(
  tabPattern: string,
  options: { port?: number; host?: string }
): Promise<any> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  const tab = await resolveTab(tabPattern, port, host);
  const client = await connectToTab(tab.id, port, host);

  try {
    const r = await client.Runtime.evaluate({
      expression: DISMISS_OVERLAYS_SCRIPT,
      returnByValue: true
    });
    await client.close();
    return r.result.value;
  } catch (error) {
    await client.close();
    throw error;
  }
}

const CAPTCHA_DETECT_SCRIPT = `
(function() {
  // Find captcha iframes on the page
  const iframes = document.querySelectorAll('iframe');
  const captchas = [];

  for (const iframe of iframes) {
    const src = iframe.src || '';
    let type = null;
    if (src.includes('arkoselabs') || src.includes('funcaptcha')) type = 'arkose';
    else if (src.includes('recaptcha') || src.includes('google.com/recaptcha')) type = 'recaptcha';
    else if (src.includes('hcaptcha')) type = 'hcaptcha';
    else if (src.includes('captcha')) type = 'unknown-captcha';
    else if (src.includes('octocaptcha')) type = 'octocaptcha';

    if (type) {
      captchas.push({ type, src: src.substring(0, 200), id: iframe.id || null, visible: iframe.offsetWidth > 0 });
    }
  }

  return captchas;
})()
`;

const CAPTCHA_INTERACT_SCRIPT = `
(function(action) {
  // Find the captcha game document by walking iframe chain
  function findGameDoc(root, depth) {
    if (depth > 5) return null;
    // Check current document for captcha controls
    const hasControls = root.querySelector('a[aria-label], button[aria-label="Audio"], button[aria-label="Restart"]');
    if (hasControls && root !== document) return root;
    // Check child iframes
    const iframes = root.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) continue;
        const found = findGameDoc(doc, depth + 1);
        if (found) return found;
      } catch(e) { continue; }
    }
    return null;
  }

  let gameDoc = findGameDoc(document, 0);

  if (!gameDoc) return { found: false, error: 'No captcha game frame found' };

  // Read captcha state
  const instructions = gameDoc.querySelector('.challenge-instructions, [class*="instructions"], [class*="prompt"]');
  const instructionText = instructions?.innerText?.trim() || null;

  const buttons = [];
  for (const el of gameDoc.querySelectorAll('a[aria-label], button[aria-label], button[type="submit"], #submit, .submit')) {
    const label = el.getAttribute('aria-label') || el.innerText?.trim() || el.id;
    if (label) buttons.push(label);
  }

  if (action === 'read') {
    return { found: true, instructions: instructionText, buttons };
  }

  // Perform action
  if (action === 'next' || action === 'right') {
    const btn = gameDoc.querySelector('a[aria-label*="next" i], a[aria-label*="Navigate to next" i]');
    if (btn) { btn.click(); return { found: true, action: 'next', clicked: true }; }
    return { found: true, action: 'next', clicked: false, error: 'Next button not found' };
  }

  if (action === 'prev' || action === 'left') {
    const btn = gameDoc.querySelector('a[aria-label*="previous" i], a[aria-label*="Navigate to previous" i]');
    if (btn) { btn.click(); return { found: true, action: 'prev', clicked: true }; }
    return { found: true, action: 'prev', clicked: false, error: 'Previous button not found' };
  }

  if (action === 'submit') {
    const btn = gameDoc.querySelector('button[type="submit"], #submit, .submit, button:not([aria-label*="Audio"]):not([aria-label*="Restart"])');
    if (btn) { btn.click(); return { found: true, action: 'submit', clicked: true }; }
    return { found: true, action: 'submit', clicked: false, error: 'Submit button not found' };
  }

  if (action === 'audio') {
    const btn = gameDoc.querySelector('button[aria-label*="Audio" i]');
    if (btn) { btn.click(); return { found: true, action: 'audio', clicked: true }; }
    return { found: true, action: 'audio', clicked: false };
  }

  if (action === 'restart') {
    const btn = gameDoc.querySelector('button[aria-label*="Restart" i]');
    if (btn) { btn.click(); return { found: true, action: 'restart', clicked: true }; }
    return { found: true, action: 'restart', clicked: false };
  }

  return { found: true, error: 'Unknown action: ' + action };
})
`;

export interface CaptchaRequest {
  tab: string;
  action: 'detect' | 'read' | 'next' | 'prev' | 'submit' | 'audio' | 'restart';
}

export async function captchaInteract(
  request: CaptchaRequest,
  options: { port?: number; host?: string }
): Promise<any> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  if (request.action === 'detect') {
    // Detect captchas on the main page
    const tab = await resolveTab(request.tab, port, host);
    const client = await connectToTab(tab.id, port, host);
    try {
      const r = await client.Runtime.evaluate({ expression: CAPTCHA_DETECT_SCRIPT, returnByValue: true });
      await client.close();
      return { captchas: r.result.value };
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  // For all other actions, find the captcha iframe and interact
  // Priority order: arkoselabs (has the game), then recaptcha/hcaptcha, then octocaptcha (wrapper)
  const allTargets = await CDP.List({ port, host });
  const iframeTargets = allTargets.filter((t: any) => t.type === 'iframe');
  const captchaTarget =
    iframeTargets.find((t: any) => t.url.includes('arkoselabs') || t.url.includes('funcaptcha')) ||
    iframeTargets.find((t: any) => t.url.includes('recaptcha') || t.url.includes('hcaptcha')) ||
    iframeTargets.find((t: any) => t.url.includes('octocaptcha') || t.url.includes('captcha'));

  if (!captchaTarget) {
    return { found: false, error: 'No captcha iframe found in CDP targets' };
  }

  const client = await connectToTab(captchaTarget.id, port, host);
  try {
    const r = await client.Runtime.evaluate({
      expression: `(${CAPTCHA_INTERACT_SCRIPT})(${JSON.stringify(request.action)})`,
      returnByValue: true
    });
    await client.close();
    return r.result.value;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function focusTab(
  tabPattern: string,
  options: { port?: number; host?: string }
): Promise<{ id: string; title: string; url: string }> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  const tab = await resolveTab(tabPattern, port, host);
  const client = await connectToTab(tab.id, port, host);

  try {
    await (client.Page as any).bringToFront();
    await client.close();
    return { id: tab.id, title: tab.title, url: tab.url };
  } catch (error) {
    await client.close();
    throw error;
  }
}

// Raw CDP key typing — no clear step, no element focus. Types directly into whatever has focus.
// Designed for apps like Google Sheets where Ctrl+A/Backspace clear causes side effects.
export async function typeKeys(
  tabPattern: string,
  keys: string,
  options: { port?: number; host?: string; submit?: string }
): Promise<{ typed: number; submitted?: boolean }> {
  const port = options.port || 9222;
  const host = options.host || 'localhost';

  const tab = await resolveTab(tabPattern, port, host);
  const client = await connectToTab(tab.id, port, host);
  const cdp = client as any;

  try {
    // Type each character via CDP Input.dispatchKeyEvent
    for (const char of keys) {
      await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: char, text: char });
      await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: char });
    }

    let submitted = false;
    if (options.submit === 'enter') {
      await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      submitted = true;
    } else if (options.submit === 'tab') {
      await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      submitted = true;
    }

    await client.close();
    return { typed: keys.length, submitted };
  } catch (error) {
    await client.close();
    throw error;
  }
}
