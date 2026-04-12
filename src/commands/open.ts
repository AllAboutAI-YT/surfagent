import { connectToTab } from '../chrome/connector.js';
import { getAllTabs } from '../chrome/tabs.js';

export async function openCommand(
  url: string,
  options: { port?: number; host?: string; newTab?: boolean }
): Promise<void> {
  try {
    const tabs = await getAllTabs(options.port, options.host);

    // Filter out internal chrome:// frames (e.g. newtab-footer)
    const pageTabs = tabs.filter(t => !t.url.startsWith('chrome://'));

    if (options.newTab || pageTabs.length === 0) {
      // Open in new tab by connecting to browser and creating new target
      const CDP = (await import('chrome-remote-interface')).default;
      const target = await CDP.New({
        port: options.port || 9222,
        host: options.host || 'localhost',
        url
      });

      console.log(JSON.stringify({
        success: true,
        action: 'opened_new_tab',
        id: target.id,
        url
      }, null, 2));
    } else {
      // Navigate current tab (first real page tab)
      const tab = pageTabs[0];
      const client = await connectToTab(tab.id, options.port, options.host);
      await (client.Page as any).navigate({ url });
      await (client.Page as any).bringToFront();

      await client.close();
      console.log(JSON.stringify({
        success: true,
        action: 'navigated',
        id: tab.id,
        url
      }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}
