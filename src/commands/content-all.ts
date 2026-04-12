import { getAllTabsContent } from '../chrome/content.js';

export async function contentAllCommand(options: { port?: number; host?: string }): Promise<void> {
  try {
    const contents = await getAllTabsContent(options.port, options.host);
    console.log(JSON.stringify(contents, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}
