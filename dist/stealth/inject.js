import { STEALTH_PAYLOAD } from './payload.js';
/**
 * Inject the vendored stealth payload into a CDP client. Called by the connector
 * on every new tab attach, so the payload runs before any page script.
 *
 * Disabled by setting SURFAGENT_STEALTH=0 in the process env.
 */
export async function injectStealth(client) {
    if (process.env.SURFAGENT_STEALTH === '0')
        return;
    try {
        const { Page } = client;
        if (!Page || typeof Page.addScriptToEvaluateOnNewDocument !== 'function')
            return;
        await Page.addScriptToEvaluateOnNewDocument({ source: STEALTH_PAYLOAD });
    }
    catch (e) {
        // Stealth injection is best-effort. Never fail the connect over it.
        if (process.env.SURFAGENT_DEBUG === '1') {
            console.error('[surfagent] stealth inject failed:', e.message);
        }
    }
}
