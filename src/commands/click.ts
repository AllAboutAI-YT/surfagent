import { connectToTab } from '../chrome/connector.js';
import { findTab } from '../chrome/tabs.js';

export async function clickCommand(
  pattern: string,
  selector: string,
  options: { port?: number; host?: string }
): Promise<void> {
  try {
    const tab = await findTab(pattern, options.port, options.host);
    if (!tab) {
      console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
      process.exit(1);
    }

    const client = await connectToTab(tab.id, options.port, options.host);

    // Try to click the element
    const result = await client.Runtime.evaluate({
      expression: `
        (function() {
          const searchText = ${JSON.stringify(selector)};
          let element = null;
          let matchScore = 0;
          let bestMatch = null;
          let bestScore = 0;

          // Helper: get text from element
          function getText(el) {
            const sources = [
              el.innerText,
              el.textContent,
              el.value,
              el.placeholder,
              el.getAttribute('aria-label'),
              el.getAttribute('title'),
              el.getAttribute('alt')
            ];
            for (const src of sources) {
              if (src && src.trim()) {
                return src.trim().replace(/\\s+/g, ' ');
              }
            }
            return '';
          }

          // Helper: check visibility
          function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          // Helper: check if element is interactive
          function isInteractive(el) {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            const hasClick = el.onclick !== null;
            const hasHref = el.hasAttribute('href');
            const isButton = tag === 'button' || role === 'button' || tag === 'a';
            const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
            const cursorPointer = window.getComputedStyle(el).cursor === 'pointer';
            return isButton || isInput || hasClick || hasHref || cursorPointer;
          }

          // Helper: calculate match score
          function getMatchScore(text, search) {
            const lowerText = text.toLowerCase();
            const lowerSearch = search.toLowerCase();

            if (lowerText === lowerSearch) return 100; // Exact match
            if (lowerText.startsWith(lowerSearch)) return 90; // Starts with
            if (lowerText.includes(lowerSearch)) return 80; // Contains

            // Fuzzy: check if all words in search are in text
            const searchWords = lowerSearch.split(/\\s+/);
            const allWordsFound = searchWords.every(w => lowerText.includes(w));
            if (allWordsFound) return 70;

            return 0;
          }

          // Recursive search through shadow DOM
          function searchElements(root, depth = 0) {
            if (depth > 10 || element) return;

            const allElements = root.querySelectorAll('*');

            for (const el of allElements) {
              // Check shadow DOM
              if (el.shadowRoot) {
                searchElements(el.shadowRoot, depth + 1);
                if (element) return;
              }

              if (!isVisible(el)) continue;
              if (!isInteractive(el)) continue;

              const text = getText(el);
              if (!text) continue;

              const score = getMatchScore(text, searchText);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = el;
              }

              // Early exit on exact match
              if (score === 100) {
                element = el;
                return;
              }
            }
          }

          // Strategy 1: Direct CSS selector (if it looks like one)
          if (searchText.startsWith('.') || searchText.startsWith('#') || searchText.startsWith('[')) {
            try {
              element = document.querySelector(searchText);
            } catch (e) {}
          }

          // Strategy 2: Search all elements
          if (!element) {
            searchElements(document);

            // Also check iframes
            if (!element) {
              const iframes = document.querySelectorAll('iframe');
              for (const iframe of iframes) {
                try {
                  if (iframe.contentDocument) {
                    searchElements(iframe.contentDocument);
                    if (element) break;
                  }
                } catch (e) {}
              }
            }
          }

          // Use best match if no exact match found
          if (!element && bestMatch && bestScore >= 70) {
            element = bestMatch;
          }

          if (!element) {
            return { success: false, error: 'Element not found: ' + searchText };
          }

          // Scroll into view
          element.scrollIntoView({ behavior: 'instant', block: 'center' });

          // Dispatch proper mouse events for React/Vue compatibility
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          const mouseOpts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY
          };

          element.dispatchEvent(new MouseEvent('mouseenter', mouseOpts));
          element.dispatchEvent(new MouseEvent('mouseover', mouseOpts));
          element.dispatchEvent(new MouseEvent('mousedown', { ...mouseOpts, button: 0 }));
          element.dispatchEvent(new MouseEvent('mouseup', { ...mouseOpts, button: 0 }));
          element.dispatchEvent(new MouseEvent('click', { ...mouseOpts, button: 0 }));

          // Also call native click as fallback
          element.click();

          return {
            success: true,
            clicked: element.tagName,
            text: getText(element).substring(0, 100),
            href: element.href || null,
            matchScore: bestScore || 100
          };
        })()
      `,
      returnByValue: true
    });

    await client.close();

    const clickResult = result.result.value;
    if (clickResult && clickResult.success) {
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(JSON.stringify(clickResult, null, 2));
    } else {
      console.error(JSON.stringify(clickResult || { error: 'Click failed' }));
      process.exit(1);
    }
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}
