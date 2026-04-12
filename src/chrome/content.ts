import { connectToTab, CDPClient } from './connector.js';
import { TabInfo, getAllTabs } from './tabs.js';

export interface TabContent {
  id: string;
  title: string;
  url: string;
  content: string;
}

export async function getTabContent(tab: TabInfo, port?: number, host?: string, selector?: string): Promise<TabContent> {
  let client: CDPClient | null = null;
  try {
    client = await connectToTab(tab.id, port, host);

    // Extract text content from the page (optionally from a specific selector)
    const result = await client.Runtime.evaluate({
      expression: `
        (function() {
          const selector = ${JSON.stringify(selector || null)};

          if (selector) {
            // Get text from specific element
            const element = document.querySelector(selector);
            if (element) {
              return element.innerText || element.textContent || '';
            }
            return '[Element not found: ' + selector + ']';
          }

          // Remove script and style elements
          const clone = document.body.cloneNode(true);
          const scripts = clone.querySelectorAll('script, style, noscript');
          scripts.forEach(el => el.remove());

          // Get text content
          return clone.innerText || clone.textContent || '';
        })()
      `,
      returnByValue: true
    });

    const content = result.result.value as string || '';

    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      content: content.trim()
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export async function getAllTabsContent(port?: number, host?: string): Promise<TabContent[]> {
  const tabs = await getAllTabs(port, host);
  const contents: TabContent[] = [];

  for (const tab of tabs) {
    try {
      const content = await getTabContent(tab, port, host);
      contents.push(content);
    } catch (error) {
      // If we can't get content from a tab, include it with empty content
      contents.push({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        content: `[Error extracting content: ${(error as Error).message}]`
      });
    }
  }

  return contents;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  matches: string[];
}

export async function searchTabs(query: string, port?: number, host?: string): Promise<SearchResult[]> {
  const contents = await getAllTabsContent(port, host);
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  for (const tab of contents) {
    const lines = tab.content.split('\n');
    const matches: string[] = [];

    for (const line of lines) {
      if (line.toLowerCase().includes(lowerQuery)) {
        // Include some context around the match
        const trimmedLine = line.trim();
        if (trimmedLine.length > 0) {
          matches.push(trimmedLine.substring(0, 200));
        }
      }
    }

    if (matches.length > 0) {
      results.push({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        matches: matches.slice(0, 10) // Limit matches per tab
      });
    }
  }

  return results;
}

export async function takeScreenshot(tab: TabInfo, port?: number, host?: string): Promise<string> {
  let client: CDPClient | null = null;
  try {
    client = await connectToTab(tab.id, port, host);

    const result = await (client.Page as any).captureScreenshot({
      format: 'png',
      fromSurface: true
    });

    return result.data; // Base64 encoded PNG
  } finally {
    if (client) {
      await client.close();
    }
  }
}
