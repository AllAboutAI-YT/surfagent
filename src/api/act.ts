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

  if (!tab) throw new Error(`Tab not found: ${tabPattern}`);
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
      // Focus the element and clear it
      await client.Runtime.evaluate({
        expression: `
          (function() {
            const el = document.querySelector(${JSON.stringify(field.selector)});
            if (!el) throw new Error('Element not found: ${field.selector}');
            el.focus();
            el.click();
            // Select all existing content so typing replaces it
            if (el.select) el.select();
            else if (el.setSelectionRange) el.setSelectionRange(0, el.value?.length || 0);
          })()
        `,
        returnByValue: true
      });

      // Clear existing value with select-all + delete
      await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 }); // Ctrl+A / Cmd+A
      await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
      await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace', code: 'Backspace' });
      await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace', code: 'Backspace' });

      // Type each character via CDP Input.dispatchKeyEvent
      for (const char of field.value) {
        await cdp.Input.dispatchKeyEvent({
          type: 'keyDown',
          key: char,
          text: char,
        });
        await cdp.Input.dispatchKeyEvent({
          type: 'keyUp',
          key: char,
        });
      }

      // Verify the value was set
      const verify = await client.Runtime.evaluate({
        expression: `document.querySelector(${JSON.stringify(field.selector)})?.value`,
        returnByValue: true
      });

      const actual = verify.result.value as string;
      if (actual === field.value) {
        results.push({ selector: field.selector, success: true });
      } else {
        results.push({ selector: field.selector, success: true, error: `Value mismatch: got "${actual}"` });
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
            const all = document.querySelectorAll('a, button, input[type="submit"], [role="button"], [onclick]');
            for (const candidate of all) {
              const t = (candidate.innerText || candidate.textContent || candidate.value || '').trim();
              if (t.toLowerCase().includes(lower)) { el = candidate; break; }
            }
          }
          if (!el) return { success: false, error: 'Element not found' };

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
          const atBottom = (scrollY + viewportHeight) >= (scrollHeight - 10);

          // Get visible text content
          const centerY = scrollY + viewportHeight / 2;
          const elements = document.elementsFromPoint(window.innerWidth / 2, viewportHeight / 2);
          let contentPreview = '';
          for (const el of elements) {
            const text = el.innerText?.trim();
            if (text && text.length > 50) {
              contentPreview = text.substring(0, 1500);
              break;
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
      await (client.Page as any).navigate({ url: request.url });
      await (client.Page as any).loadEventFired();
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
    const result = await client.Runtime.evaluate({
      expression,
      returnByValue: true
    });
    await client.close();
    return result.result.value;
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
