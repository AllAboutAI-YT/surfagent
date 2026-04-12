declare module 'chrome-remote-interface' {
  interface CDPOptions {
    target?: string;
    port?: number;
    host?: string;
  }

  interface ListOptions {
    port?: number;
    host?: string;
  }

  interface Target {
    id: string;
    type: string;
    title: string;
    url: string;
    webSocketDebuggerUrl?: string;
  }

  interface RuntimeEvaluateResult {
    result: {
      value?: any;
      type?: string;
    };
  }

  interface Client {
    Page: {
      enable(): Promise<void>;
      captureScreenshot(options?: {
        format?: string;
        fromSurface?: boolean;
      }): Promise<{ data: string }>;
    };
    Runtime: {
      enable(): Promise<void>;
      evaluate(options: {
        expression: string;
        returnByValue?: boolean;
      }): Promise<RuntimeEvaluateResult>;
    };
    DOM: {
      enable(): Promise<void>;
    };
    close(): Promise<void>;
  }

  function CDP(options?: CDPOptions): Promise<Client>;

  namespace CDP {
    function List(options?: ListOptions): Promise<Target[]>;
    function New(options?: { port?: number; host?: string; url?: string }): Promise<Target>;
    function Close(options?: { port?: number; host?: string; id: string }): Promise<void>;
    interface Client {
      Page: Client['Page'];
      Runtime: Client['Runtime'];
      DOM: Client['DOM'];
      close(): Promise<void>;
    }
  }

  export = CDP;
}
