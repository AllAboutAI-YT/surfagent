/**
 * Stealth payload — vendored evasions adapted from puppeteer-extra-plugin-stealth (MIT).
 * Original: https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth
 *
 * This payload is injected into every new document via Page.addScriptToEvaluateOnNewDocument
 * BEFORE any page script runs. Each evasion is annotated with `// @evasion: <name>` so
 * future Chrome-version drift is debuggable.
 *
 * Why vendored, not depended-on: puppeteer-extra-plugin-stealth pulls in puppeteer-extra
 * which pulls in puppeteer (~60 MB). Surfagent is CDP-direct; we want ~400 lines of pure
 * JS we can patch in-place, not a peer-dep tree.
 */
export declare const STEALTH_PAYLOAD: string;
