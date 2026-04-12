import { connectToTab } from '../chrome/connector.js';
import { findTab } from '../chrome/tabs.js';
export async function typeCommand(pattern, text, options) {
    try {
        const tab = await findTab(pattern, options.port, options.host);
        if (!tab) {
            console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
            process.exit(1);
        }
        const client = await connectToTab(tab.id, options.port, options.host);
        const cdp = client;
        const selector = options.selector || 'textarea, input[type="text"], input:not([type]), [contenteditable="true"]';
        // Focus the target element
        const focusResult = await client.Runtime.evaluate({
            expression: `
        (function() {
          const selector = ${JSON.stringify(selector)};
          let element = document.querySelector(selector);
          if (!element) {
            const candidates = document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]');
            for (const el of candidates) {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
                element = el;
                break;
              }
            }
          }
          if (!element) return { success: false, error: 'No input element found' };
          element.focus();
          element.click();
          if (element.select) element.select();
          return { success: true, tag: element.tagName };
        })()
      `,
            returnByValue: true
        });
        const focus = focusResult.result.value;
        if (!focus.success) {
            console.error(JSON.stringify(focus));
            await client.close();
            process.exit(1);
        }
        // Clear existing content
        await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
        await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
        await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace', code: 'Backspace' });
        await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace', code: 'Backspace' });
        // Type each character via CDP
        for (const char of text) {
            await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: char, text: char });
            await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: char });
        }
        // Submit if requested
        if (options.submit) {
            await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
            await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        }
        // Verify
        const verifyResult = await client.Runtime.evaluate({
            expression: `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          return { success: true, typed: ${JSON.stringify(text)}, element: el?.tagName, value: el?.value, submitted: ${options.submit || false} };
        })()
      `,
            returnByValue: true
        });
        await client.close();
        console.log(JSON.stringify(verifyResult.result.value, null, 2));
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
