import { getAllTabsContent } from '../chrome/content.js';
export async function contentAllCommand(options) {
    try {
        const contents = await getAllTabsContent(options.port, options.host);
        console.log(JSON.stringify(contents, null, 2));
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
