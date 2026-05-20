/**
 * Inject the vendored stealth payload into a CDP client. Called by the connector
 * on every new tab attach, so the payload runs before any page script.
 *
 * Disabled by setting SURFAGENT_STEALTH=0 in the process env.
 */
export declare function injectStealth(client: any): Promise<void>;
