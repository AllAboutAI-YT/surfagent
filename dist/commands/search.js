import { searchTabs } from '../chrome/content.js';
export async function searchCommand(query, options) {
    try {
        const results = await searchTabs(query, options.port, options.host);
        console.log(JSON.stringify(results, null, 2));
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
