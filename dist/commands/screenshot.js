import * as fs from 'fs';
import * as path from 'path';
import { findTab } from '../chrome/tabs.js';
import { takeScreenshot } from '../chrome/content.js';
export async function screenshotCommand(pattern, options) {
    try {
        const tab = await findTab(pattern, options.port, options.host);
        if (!tab) {
            console.error(JSON.stringify({ error: `Tab not found: ${pattern}` }));
            process.exit(1);
        }
        const base64Data = await takeScreenshot(tab, options.port, options.host);
        const outputPath = options.output || `screenshot-${Date.now()}.png`;
        const absolutePath = path.resolve(outputPath);
        fs.writeFileSync(absolutePath, Buffer.from(base64Data, 'base64'));
        console.log(JSON.stringify({
            success: true,
            tab: {
                id: tab.id,
                title: tab.title,
                url: tab.url
            },
            output: absolutePath
        }, null, 2));
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
