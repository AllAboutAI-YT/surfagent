import { searchTabs } from '../chrome/content.js';

export async function searchCommand(
  query: string,
  options: { port?: number; host?: string }
): Promise<void> {
  try {
    const results = await searchTabs(query, options.port, options.host);
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}
