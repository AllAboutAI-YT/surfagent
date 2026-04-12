import { TabInfo } from './tabs.js';
export interface TabContent {
    id: string;
    title: string;
    url: string;
    content: string;
}
export declare function getTabContent(tab: TabInfo, port?: number, host?: string, selector?: string): Promise<TabContent>;
export declare function getAllTabsContent(port?: number, host?: string): Promise<TabContent[]>;
export interface SearchResult {
    id: string;
    title: string;
    url: string;
    matches: string[];
}
export declare function searchTabs(query: string, port?: number, host?: string): Promise<SearchResult[]>;
export declare function takeScreenshot(tab: TabInfo, port?: number, host?: string): Promise<string>;
