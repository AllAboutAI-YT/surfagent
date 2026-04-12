export declare function typeCommand(pattern: string, text: string, options: {
    port?: number;
    host?: string;
    selector?: string;
    submit?: boolean;
}): Promise<void>;
