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

const DEFAULT_PORT = 9222;
const DEFAULT_HOST = 'localhost';

export async function listTargets(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<CDPTarget[]> {
  try {
    const targets = await CDP.List({ port, host });
    return targets.filter((t: CDPTarget) => t.type === 'page');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot connect to Chrome. Make sure Chrome is running with --remote-debugging-port=${port}\n` +
        `Start Chrome with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${port}`
      );
    }
    throw error;
  }
}

export async function connectToTab(targetId: string, port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<CDPClient> {
  const client = await CDP({ target: targetId, port, host });
  await client.Page.enable();
  await client.Runtime.enable();
  await client.DOM.enable();
  return client as CDPClient;
}

export async function connectToFirstTab(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<{ client: CDPClient; target: CDPTarget }> {
  const targets = await listTargets(port, host);
  if (targets.length === 0) {
    throw new Error('No browser tabs found');
  }
  const target = targets[0];
  const client = await connectToTab(target.id, port, host);
  return { client, target };
}
