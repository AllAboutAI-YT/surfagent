interface DialogEvent {
    tabId: string;
    tabUrl: string;
    type: string;
    message: string;
    action: string;
    timestamp: string;
}
export declare function getDialogLog(): DialogEvent[];
export declare function clearDialogLog(): void;
export declare function startDialogWatcher(port?: number, host?: string): void;
export declare function stopDialogWatcher(): void;
export declare function dismissDialog(tabPattern: string, accept: boolean, options: {
    port?: number;
    host?: string;
}): Promise<{
    success: boolean;
    error?: string;
}>;
export {};
