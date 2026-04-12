import { findTab } from '../chrome/tabs.js';
import { getTabContent } from '../chrome/content.js';

export async function contentCommand(
  pattern: string,
  options: { port?: number; host?: string; selector?: string }
): Promise<void> {
  try {
    const tab = await findTab(pattern, options.port, options.host);
    if (!tab) {
      console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
      process.exit(1);
    }

    const content = await getTabContent(tab, options.port, options.host, options.selector);
    console.log(JSON.stringify(content, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}
