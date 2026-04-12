import { connectToTab } from '../chrome/connector.js';
import { findTab, getAllTabs } from '../chrome/tabs.js';
export async function closeCommand(pattern, options) {
    try {
        // Special case: close all tabs matching a pattern
        if (pattern === 'all') {
            const tabs = await getAllTabs(options.port, options.host);
            if (tabs.length <= 1) {
                console.log(JSON.stringify({ message: 'Only one tab open, not closing' }));
                return;
            }
            // Close all but the first tab
            let closed = 0;
            for (let i = tabs.length - 1; i > 0; i--) {
                try {
                    const client = await connectToTab(tabs[i].id, options.port, options.host);
                    await client.Page.close();
                    await client.close();
                    closed++;
                }
                catch (e) {
                    // Tab may already be closed
                }
            }
            console.log(JSON.stringify({ success: true, closed, remaining: 1 }));
            return;
        }
        const tab = await findTab(pattern, options.port, options.host);
        if (!tab) {
            console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
            process.exit(1);
        }
        const client = await connectToTab(tab.id, options.port, options.host);
        // Close the tab
        await client.Page.close();
        await client.close();
        console.log(JSON.stringify({
            success: true,
            closed: {
                id: tab.id,
                title: tab.title,
                url: tab.url
            }
        }));
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
