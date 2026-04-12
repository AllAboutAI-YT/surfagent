import { getAllTabs } from '../chrome/tabs.js';

export async function listCommand(options: { port?: number; host?: string }): Promise<void> {
  try {
    const tabs = await getAllTabs(options.port, options.host);
    console.log(JSON.stringify(tabs, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}
