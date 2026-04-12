import { connectToTab } from '../chrome/connector.js';
import { findTab } from '../chrome/tabs.js';

export async function descCommand(
  pattern: string,
  options: { port?: number; host?: string }
): Promise<void> {
  try {
    const tab = await findTab(pattern, options.port, options.host);
    if (!tab) {
      console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
      process.exit(1);
    }

    const client = await connectToTab(tab.id, options.port, options.host);

    const result = await client.Runtime.evaluate({
      expression: `
        (function() {
          // Try to get description from JSON-LD schema
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of scripts) {
            try {
              const data = JSON.parse(script.textContent);
              if (data['@type'] === 'Product' && data.description) {
                return {
                  source: 'json-ld',
                  description: data.description,
                  name: data.name,
                  brand: data.brand,
                  price: data.offers?.price,
                  currency: data.offers?.priceCurrency,
                  condition: data.itemCondition
                };
              }
            } catch (e) {}
          }

          // Try meta description
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) {
            return {
              source: 'meta',
              description: metaDesc.getAttribute('content')
            };
          }

          // Try og:description
          const ogDesc = document.querySelector('meta[property="og:description"]');
          if (ogDesc) {
            return {
              source: 'og',
              description: ogDesc.getAttribute('content')
            };
          }

          return { error: 'No description found' };
        })()
      `,
      returnByValue: true
    });

    await client.close();
    console.log(JSON.stringify(result.result.value, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}
