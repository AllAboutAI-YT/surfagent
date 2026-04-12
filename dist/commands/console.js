import { connectToTab } from '../chrome/connector.js';
import { findTab } from '../chrome/tabs.js';
export async function consoleCommand(pattern, script, options) {
    try {
        const tab = await findTab(pattern, options.port, options.host);
        if (!tab) {
            console.error(JSON.stringify({ error: `No tab matching: ${pattern}` }));
            process.exit(1);
        }
        const client = await connectToTab(tab.id, options.port, options.host);
        const result = await client.Runtime.evaluate({
            expression: script,
            returnByValue: true,
            awaitPromise: true
        });
        await client.close();
        if (result.exceptionDetails) {
            console.error(JSON.stringify({
                error: result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'Script error'
            }));
            process.exit(1);
        }
        const value = result.result.value;
        if (typeof value === 'object') {
            console.log(JSON.stringify(value, null, 2));
        }
        else {
            console.log(value);
        }
    }
    catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}
