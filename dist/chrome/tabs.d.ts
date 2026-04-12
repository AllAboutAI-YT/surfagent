export interface TabInfo {
    id: string;
    index: number;
    title: string;
    url: string;
}
export declare function getAllTabs(port?: number, host?: string): Promise<TabInfo[]>;
export declare function findTab(pattern: string, port?: number, host?: string): Promise<TabInfo | null>;
