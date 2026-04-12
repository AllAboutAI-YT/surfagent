import { connectToTab } from '../chrome/connector.js';
import { findTab } from '../chrome/tabs.js';
export async function elementsCommand(pattern, options) {
    try {
        const tab = await findTab(pattern, options.port, options.host);
        if (!tab) {
            console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
            process.exit(1);
        }
        const client = await connectToTab(tab.id, options.port, options.host);
        const elementType = options.type || 'interactive';
        const result = await client.Runtime.evaluate({
            expression: `
        (function() {
          const type = ${JSON.stringify(elementType)};
          const results = [];
          const seen = new Set();

          // Function to get text from an element
          function getText(el) {
            // Try various sources of text
            const sources = [
              el.innerText,
              el.textContent,
              el.value,
              el.placeholder,
              el.getAttribute('aria-label'),
              el.getAttribute('title'),
              el.getAttribute('alt'),
              el.getAttribute('name'),
              // For inputs, check labels
              el.id ? document.querySelector('label[for="' + el.id + '"]')?.textContent : null
            ];
            for (const src of sources) {
              if (src && src.trim()) {
                return src.trim().replace(/\\s+/g, ' ').substring(0, 100);
              }
            }
            return '';
          }

          // Function to check if element is visible
          function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          // Function to check if element is clickable
          function isClickable(el) {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            const hasClick = el.onclick !== null || el.getAttribute('onclick');
            const hasHref = el.hasAttribute('href');
            const isButton = tag === 'button' || role === 'button' || tag === 'a';
            const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
            const hasTabindex = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
            const cursorPointer = window.getComputedStyle(el).cursor === 'pointer';

            return isButton || isInput || hasClick || hasHref || hasTabindex || cursorPointer;
          }

          // Recursively find elements including shadow DOM
          function findElements(root, depth = 0) {
            if (depth > 10) return; // Prevent infinite recursion

            const allElements = root.querySelectorAll('*');

            for (const el of allElements) {
              // Check shadow DOM
              if (el.shadowRoot) {
                findElements(el.shadowRoot, depth + 1);
              }

              // Skip if not visible
              if (!isVisible(el)) continue;

              // Check if clickable based on type filter
              let shouldInclude = false;
              const tag = el.tagName.toLowerCase();
              const role = el.getAttribute('role');

              if (type === 'buttons') {
                shouldInclude = tag === 'button' || role === 'button' ||
                               (tag === 'input' && (el.type === 'submit' || el.type === 'button'));
              } else if (type === 'links') {
                shouldInclude = tag === 'a' && el.hasAttribute('href');
              } else if (type === 'inputs') {
                shouldInclude = tag === 'input' || tag === 'textarea' || tag === 'select';
              } else {
                // interactive - include all clickable elements
                shouldInclude = isClickable(el);
              }

              if (!shouldInclude) continue;

              const text = getText(el);

              // Create unique key to avoid duplicates
              const key = tag + ':' + text + ':' + (el.href || '') + ':' + (el.id || '');
              if (seen.has(key)) continue;
              seen.add(key);

              // Skip elements with no useful text (except inputs)
              if (!text && tag !== 'input' && tag !== 'textarea' && tag !== 'select') continue;

              const rect = el.getBoundingClientRect();
              results.push({
                tag: el.tagName,
                text: text,
                type: el.type || null,
                href: el.href || null,
                id: el.id || null,
                class: el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : null,
                role: role,
                x: Math.round(rect.x),
                y: Math.round(rect.y)
              });
            }
          }

          // Start from document
          findElements(document);

          // Also check iframes
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              if (iframe.contentDocument) {
                findElements(iframe.contentDocument);
              }
            } catch (e) {
              // Cross-origin iframe, skip
            }
          }

          // Sort by vertical position (top to bottom)
          results.sort((a, b) => a.y - b.y);

          return results.slice(0, 100);
        })()
      `,
            returnByValue: true
        });
        await client.close();
        console.log(JSON.stringify(result.result.value, null, 2));
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
