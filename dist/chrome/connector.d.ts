import CDP from 'chrome-remote-interface';
export interface CDPClient {
    Page: CDP.Client['Page'];
    Runtime: CDP.Client['Runtime'];
    DOM: CDP.Client['DOM'];
    close: () => Promise<void>;
}
export interface CDPTarget {
    id: string;
    type: string;
    title: string;
    url: string;
    webSocketDebuggerUrl?: string;
}
export declare function listTargets(port?: number, host?: string): Promise<CDPTarget[]>;
export declare function connectToTab(targetId: string, port?: number, host?: string): Promise<CDPClient>;
export declare function connectToFirstTab(port?: number, host?: string): Promise<{
    client: CDPClient;
    target: CDPTarget;
}>;
