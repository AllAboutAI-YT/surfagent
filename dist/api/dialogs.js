import CDP from 'chrome-remote-interface';
import { listTargets } from '../chrome/connector.js';
// Rolling log of recent dialogs
const dialogLog = [];
const MAX_LOG = 50;
// Track which tabs we're already watching
const watchedTabs = new Set();
function logDialog(event) {
    dialogLog.push(event);
    if (dialogLog.length > MAX_LOG)
        dialogLog.shift();
    console.log(`[DIALOG] ${event.type} on ${event.tabUrl}: "${event.message.substring(0, 80)}" → ${event.action}`);
}
export function getDialogLog() {
    return [...dialogLog];
}
export function clearDialogLog() {
    dialogLog.length = 0;
}
async function watchTab(targetId, targetUrl, port, host) {
    if (watchedTabs.has(targetId))
        return;
    watchedTabs.add(targetId);
    try {
        const client = await CDP({ target: targetId, port, host });
        await client.Page.enable();
        client.on('Page.javascriptDialogOpening', async (params) => {
            const event = {
                tabId: targetId,
                tabUrl: targetUrl,
                type: params.type,
                message: params.message || '',
                action: params.type === 'beforeunload' ? 'accepted' : 'dismissed',
                timestamp: new Date().toISOString(),
            };
            logDialog(event);
            // Auto-dismiss: accept beforeunload (so navigation isn't blocked), dismiss others
            try {
                await client.Page.handleJavaScriptDialog({
                    accept: params.type === 'beforeunload',
                });
            }
            catch { }
        });
        // Clean up when tab closes
        client.on('disconnect', () => {
            watchedTabs.delete(targetId);
        });
    }
    catch {
        watchedTabs.delete(targetId);
    }
}
let watcherInterval = null;
export function startDialogWatcher(port = 9222, host = 'localhost') {
    // Poll for new tabs every 3 seconds and attach dialog listeners
    watcherInterval = setInterval(async () => {
        try {
            const targets = await listTargets(port, host);
            for (const target of targets) {
                await watchTab(target.id, target.url, port, host);
            }
        }
        catch { }
    }, 3000);
    console.log('Dialog watcher started — auto-dismissing JS dialogs on all tabs');
}
export function stopDialogWatcher() {
    if (watcherInterval) {
        clearInterval(watcherInterval);
        watcherInterval = null;
    }
}
// Manually dismiss any open dialog on a specific tab
export async function dismissDialog(tabPattern, accept, options) {
    const port = options.port || 9222;
    const host = options.host || 'localhost';
    const targets = await listTargets(port, host);
    const index = parseInt(tabPattern, 10);
    let target = !isNaN(index) && index >= 0 && index < targets.length ? targets[index] : null;
    if (!target) {
        const lower = tabPattern.toLowerCase();
        target = targets.find(t => t.url.toLowerCase().includes(lower) || t.title.toLowerCase().includes(lower)) || null;
    }
    if (!target)
        return { success: false, error: `Tab not found: ${tabPattern}` };
    try {
        const client = await CDP({ target: target.id, port, host });
        await client.Page.enable();
        await client.Page.handleJavaScriptDialog({ accept });
        await client.close();
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
}
