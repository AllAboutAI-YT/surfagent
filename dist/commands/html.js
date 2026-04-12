import { connectToTab } from '../chrome/connector.js';
import { findTab } from '../chrome/tabs.js';
export async function htmlCommand(pattern, options) {
    try {
        const tab = await findTab(pattern, options.port, options.host);
        if (!tab) {
            console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
            process.exit(1);
        }
        const client = await connectToTab(tab.id, options.port, options.host);
        const selector = options.selector;
        const result = await client.Runtime.evaluate({
            expression: `
        (function() {
          const selector = ${JSON.stringify(selector || null)};

          if (selector) {
            const element = document.querySelector(selector);
            if (element) {
              return element.outerHTML;
            }
            // Try to find elements containing the class name
            const allElements = document.querySelectorAll('*');
            const matches = [];
            for (const el of allElements) {
              if (el.className && typeof el.className === 'string' && el.className.includes(selector.replace('.', ''))) {
                matches.push({
                  tag: el.tagName,
                  class: el.className,
                  text: (el.innerText || '').substring(0, 200)
                });
              }
            }
            if (matches.length > 0) {
              return JSON.stringify({ elementNotFound: selector, similarElements: matches.slice(0, 10) });
            }
            return '[Element not found: ' + selector + ']';
          }

          return document.documentElement.outerHTML;
        })()
      `,
            returnByValue: true
        });
        await client.close();
        console.log(result.result.value);
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
