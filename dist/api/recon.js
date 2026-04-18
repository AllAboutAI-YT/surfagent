import CDP from 'chrome-remote-interface';
import { connectToTab } from '../chrome/connector.js';
import { getAllTabs } from '../chrome/tabs.js';
const EXTRACTION_SCRIPT = `
(function() {
  // ---- Helpers ----
  function getText(el) {
    const sources = [
      el.innerText, el.textContent, el.value, el.placeholder,
      el.getAttribute('aria-label'), el.getAttribute('title'),
      el.getAttribute('alt'), el.getAttribute('name'),
      el.id ? document.querySelector('label[for="' + el.id + '"]')?.textContent : null
    ];
    for (const src of sources) {
      if (src && src.trim()) return src.trim().replace(/\\s+/g, ' ').substring(0, 120);
    }
    return '';
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function cssAttr(v) {
    // Escape backslashes and double-quotes so the value is safe inside [attr="..."].
    // Without this, attribute values containing " (e.g. aria-label='Close "dialog"')
    // produce syntactically invalid selectors that agents cannot use.
    return '"' + String(v).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') + '"';
  }

  function buildSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    if (el.getAttribute('aria-label')) return tag + '[aria-label=' + cssAttr(el.getAttribute('aria-label')) + ']';
    if (el.getAttribute('data-testid')) return '[data-testid=' + cssAttr(el.getAttribute('data-testid')) + ']';
    if (el.getAttribute('name')) {
      const nameSelector = tag + '[name=' + cssAttr(el.getAttribute('name')) + ']';
      // Disambiguate radio/checkbox with same name by adding value
      if ((el.type === 'radio' || el.type === 'checkbox') && el.value) {
        return nameSelector + '[value=' + cssAttr(el.value) + ']';
      }
      return nameSelector;
    }
    // Positional fallback
    const parent = el.parentElement;
    if (!parent) return tag;
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    if (siblings.length === 1) return buildSelector(parent) + ' > ' + tag;
    const idx = siblings.indexOf(el) + 1;
    return buildSelector(parent) + ' > ' + tag + ':nth-child(' + idx + ')';
  }

  function isClickable(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    return tag === 'button' || tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select'
      || role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem' || role === 'option' || role === 'listitem' || role === 'treeitem'
      || el.onclick !== null || el.getAttribute('onclick')
      || (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1')
      || window.getComputedStyle(el).cursor === 'pointer';
  }

  // ---- Meta ----
  const metaDesc = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  const jsonLd = [];
  for (const s of jsonLdScripts) {
    try { jsonLd.push(JSON.parse(s.textContent)); } catch(e) {}
  }

  // ---- Headings ----
  const headings = [];
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (!isVisible(h)) continue;
    const text = h.innerText?.trim();
    if (text) headings.push({ level: parseInt(h.tagName[1]), text: text.substring(0, 200) });
  }

  // ---- Navigation links ----
  const navigation = [];
  const navEls = document.querySelectorAll('nav a[href], header a[href], [role="navigation"] a[href]');
  const navSeen = new Set();
  for (const a of navEls) {
    if (!isVisible(a)) continue;
    const text = a.innerText?.trim();
    const href = a.href;
    if (!text || navSeen.has(href)) continue;
    navSeen.add(href);
    const section = a.closest('nav,header,[role="navigation"]');
    const sectionLabel = section?.getAttribute('aria-label') || null;
    navigation.push({ text: text.substring(0, 100), href, section: sectionLabel });
  }

  // ---- Interactive elements ----
  const elements = [];
  const elSeen = new Set();
  function findElements(root, depth) {
    if (depth > 8) return;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) findElements(el.shadowRoot, depth + 1);
      if (!isVisible(el) || !isClickable(el)) continue;
      const text = getText(el);
      const key = el.tagName + ':' + text + ':' + (el.href || '') + ':' + (el.id || '');
      if (elSeen.has(key)) continue;
      elSeen.add(key);
      if (!text && !['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) continue;
      const rect = el.getBoundingClientRect();
      elements.push({
        tag: el.tagName,
        text,
        type: el.type || null,
        href: el.href || null,
        id: el.id || null,
        selector: buildSelector(el),
        role: el.getAttribute('role'),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        ...(el.dataset && Object.keys(el.dataset).length > 0 ? {
          data: Object.fromEntries(
            ['date','iso','value','testid','id'].filter(k => el.dataset[k]).map(k => [k, el.dataset[k]])
          )
        } : {})
      });
    }
  }
  findElements(document, 0);
  try {
    for (const iframe of document.querySelectorAll('iframe')) {
      if (iframe.contentDocument) findElements(iframe.contentDocument, 0);
    }
  } catch(e) {}
  elements.sort((a, b) => a.y - b.y);

  // ---- Forms ----
  const forms = [];
  for (const form of document.querySelectorAll('form')) {
    if (!isVisible(form)) continue;
    const fields = [];
    for (const el of form.querySelectorAll('input,textarea,select')) {
      if (!isVisible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const type = el.type || null;
      if (type === 'hidden') continue;
      const labelEl = el.id ? document.querySelector('label[for="' + el.id + '"]') : el.closest('label');
      const label = labelEl?.innerText?.trim()?.substring(0, 100) || el.getAttribute('aria-label') || null;
      let options = null;
      if (tag === 'select') {
        options = Array.from(el.querySelectorAll('option')).map(o => o.textContent?.trim()).filter(Boolean).slice(0, 20);
      }
      fields.push({
        tag, type,
        name: el.getAttribute('name'),
        id: el.id || null,
        label,
        placeholder: el.placeholder || null,
        required: el.required || el.getAttribute('aria-required') === 'true',
        options,
        selector: buildSelector(el)
      });
    }
    forms.push({
      action: form.action || null,
      method: (form.method || 'get').toUpperCase(),
      id: form.id || null,
      fields
    });
  }

  // ---- Landmarks ----
  const landmarks = [];
  const landmarkRoles = ['banner','main','navigation','complementary','contentinfo','search','form','region'];
  for (const role of landmarkRoles) {
    for (const el of document.querySelectorAll('[role="' + role + '"],' + (role === 'banner' ? 'header' : role === 'main' ? 'main' : role === 'navigation' ? 'nav' : role === 'contentinfo' ? 'footer' : role === 'search' ? 'search' : '_never_'))) {
      if (!isVisible(el)) continue;
      landmarks.push({
        role,
        label: el.getAttribute('aria-label') || null,
        tag: el.tagName.toLowerCase()
      });
    }
  }

  // ---- Overlays / modals / blocking popups ----
  const overlays = [];
  // Check for modal dialogs
  for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], .modal, [data-overlay], [aria-modal="true"]')) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 50) {
      overlays.push({
        type: 'dialog',
        text: (el.innerText || '').trim().substring(0, 200),
        selector: buildSelector(el)
      });
    }
  }
  // Check for cookie banners and consent overlays
  for (const el of document.querySelectorAll('[class*="cookie"], [class*="consent"], [class*="banner"], [id*="cookie"], [id*="consent"]')) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 200) {
      overlays.push({
        type: 'cookie/consent',
        text: (el.innerText || '').trim().substring(0, 200),
        selector: buildSelector(el)
      });
    }
  }
  // Check for full-screen overlays (fixed/absolute positioned covering viewport)
  for (const el of document.querySelectorAll('body > div, body > aside, body > section')) {
    if (!isVisible(el)) continue;
    const style = window.getComputedStyle(el);
    if ((style.position === 'fixed' || style.position === 'absolute') && parseFloat(style.zIndex) > 999) {
      const rect = el.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.3) {
        overlays.push({
          type: 'overlay',
          text: (el.innerText || '').trim().substring(0, 200),
          selector: buildSelector(el)
        });
      }
    }
  }
  // Deduplicate: remove overlays that are descendants of other overlays
  const deduped = overlays.filter((o, i) => {
    const el = document.querySelector(o.selector);
    if (!el) return true;
    return !overlays.some((other, j) => {
      if (i === j) return false;
      const otherEl = document.querySelector(other.selector);
      return otherEl && otherEl !== el && otherEl.contains(el);
    });
  });

  // ---- Captcha detection ----
  const captchas = [];
  for (const iframe of document.querySelectorAll('iframe')) {
    const src = iframe.src || '';
    let type = null;
    if (src.includes('arkoselabs') || src.includes('funcaptcha')) type = 'arkose';
    else if (src.includes('recaptcha') || src.includes('google.com/recaptcha')) type = 'recaptcha';
    else if (src.includes('hcaptcha')) type = 'hcaptcha';
    else if (src.includes('octocaptcha')) type = 'octocaptcha';
    else if (src.includes('captcha')) type = 'captcha';
    if (type) captchas.push({ type, src: src.substring(0, 200) });
  }

  // ---- Content summary ----
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script,style,noscript,svg').forEach(e => e.remove());
  const fullText = (clone.innerText || '').trim();
  const contentSummary = fullText.substring(0, 2000);

  return {
    meta: {
      description: metaDesc?.getAttribute('content') || null,
      ogTitle: ogTitle?.getAttribute('content') || null,
      ogDescription: ogDesc?.getAttribute('content') || null,
      jsonLd
    },
    headings,
    navigation: navigation.slice(0, 50),
    elements: elements.slice(0, 150),
    totalElements: elements.length,
    forms,
    landmarks,
    overlays: deduped,
    captchas,
    contentSummary
  };
})()
`;
export async function reconUrl(url, options) {
    const port = options.port || 9222;
    const host = options.host || 'localhost';
    const waitMs = options.waitMs || 2000;
    // Open URL in a new tab
    const target = await CDP.New({ port, host, url });
    let client = null;
    try {
        client = await connectToTab(target.id, port, host);
        // Wait for page load + extra settle time
        await client.Page.loadEventFired();
        await new Promise(resolve => setTimeout(resolve, waitMs));
        // Get page title
        const titleResult = await client.Runtime.evaluate({
            expression: 'document.title',
            returnByValue: true
        });
        let title = titleResult.result.value || '';
        // Fall back to CDP target title when document.title is empty (e.g. pages with no <title> tag)
        if (!title) {
            try {
                const targets = await CDP.List({ port, host });
                const t = targets.find((t) => t.id === target.id);
                if (t?.title)
                    title = t.title;
            }
            catch { }
        }
        // Get current URL (may have redirected)
        const urlResult = await client.Runtime.evaluate({
            expression: 'window.location.href',
            returnByValue: true
        });
        const finalUrl = urlResult.result.value || url;
        // Run the big extraction
        const extractionResult = await client.Runtime.evaluate({
            expression: EXTRACTION_SCRIPT,
            returnByValue: true
        });
        const data = extractionResult.result.value;
        await client.close();
        client = null;
        // Close the tab unless keepTab is set
        if (!options.keepTab) {
            await CDP.Close({ port, host, id: target.id });
        }
        return {
            url: finalUrl,
            title: title || target.title || '',
            tabId: target.id,
            timestamp: new Date().toISOString(),
            meta: data.meta,
            headings: data.headings,
            navigation: data.navigation,
            elements: data.elements,
            totalElements: data.totalElements || data.elements?.length || 0,
            forms: data.forms,
            contentSummary: data.contentSummary,
            landmarks: data.landmarks,
            overlays: data.overlays || [],
            captchas: data.captchas || [],
        };
    }
    catch (error) {
        if (client)
            await client.close();
        // Clean up tab on error
        try {
            await CDP.Close({ port, host, id: target.id });
        }
        catch { }
        throw error;
    }
}
export async function reconTab(tabPattern, options) {
    const port = options.port || 9222;
    const host = options.host || 'localhost';
    const tabs = await getAllTabs(port, host);
    const index = parseInt(tabPattern, 10);
    let tab = !isNaN(index) && index >= 0 && index < tabs.length ? tabs[index] : null;
    if (!tab) {
        const lower = tabPattern.toLowerCase();
        tab = tabs.find(t => t.url.toLowerCase().includes(lower) || t.title.toLowerCase().includes(lower)) || null;
    }
    // Fall back to iframe targets if no page tab matched
    if (!tab) {
        const allTargets = await CDP.List({ port, host });
        const lower = tabPattern.toLowerCase();
        const iframeTarget = allTargets.find((t) => t.type === 'iframe' &&
            (t.url.toLowerCase().includes(lower) || t.title.toLowerCase().includes(lower)));
        if (iframeTarget) {
            tab = { id: iframeTarget.id, index: -1, title: iframeTarget.title || '', url: iframeTarget.url };
        }
    }
    if (!tab)
        throw new Error(`Tab not found: ${tabPattern}`);
    const client = await connectToTab(tab.id, port, host);
    try {
        const extractionResult = await client.Runtime.evaluate({
            expression: EXTRACTION_SCRIPT,
            returnByValue: true
        });
        const data = extractionResult.result.value;
        await client.close();
        return {
            url: tab.url,
            title: tab.title,
            tabId: tab.id,
            timestamp: new Date().toISOString(),
            meta: data.meta,
            headings: data.headings,
            navigation: data.navigation,
            elements: data.elements,
            totalElements: data.totalElements || data.elements?.length || 0,
            forms: data.forms,
            contentSummary: data.contentSummary,
            landmarks: data.landmarks,
            overlays: data.overlays || [],
            captchas: data.captchas || [],
        };
    }
    catch (error) {
        await client.close();
        throw error;
    }
}
