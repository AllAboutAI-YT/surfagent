export interface FillField {
    selector: string;
    value: string;
}
export interface FillRequest {
    tab: string;
    fields: FillField[];
    submit?: string;
}
export interface FillResult {
    filled: {
        selector: string;
        success: boolean;
        error?: string;
    }[];
    submitted?: boolean;
}
export declare function fillFields(request: FillRequest, options: {
    port?: number;
    host?: string;
}): Promise<FillResult>;
export interface ClickRequest {
    tab: string;
    selector?: string;
    text?: string;
    waitAfter?: number;
}
export declare function clickElement(request: ClickRequest, options: {
    port?: number;
    host?: string;
}): Promise<{
    success: boolean;
    clicked?: string;
    error?: string;
}>;
export interface ScrollRequest {
    tab: string;
    direction?: 'down' | 'up';
    amount?: number;
}
export declare function scrollPage(request: ScrollRequest, options: {
    port?: number;
    host?: string;
}): Promise<{
    scrollY: number;
    scrollHeight: number;
    viewportHeight: number;
    atBottom: boolean;
    contentPreview: string;
}>;
export interface NavigateRequest {
    tab: string;
    url?: string;
    back?: boolean;
    forward?: boolean;
    waitMs?: number;
}
export declare function navigatePage(request: NavigateRequest, options: {
    port?: number;
    host?: string;
}): Promise<{
    url: string;
    title: string;
}>;
export declare function evalInTab(tab: string, expression: string, options: {
    port?: number;
    host?: string;
}): Promise<any>;
export declare function readPage(tabPattern: string, options: {
    port?: number;
    host?: string;
    selector?: string;
}): Promise<any>;
export declare function dismissOverlays(tabPattern: string, options: {
    port?: number;
    host?: string;
}): Promise<any>;
export interface CaptchaRequest {
    tab: string;
    action: 'detect' | 'read' | 'next' | 'prev' | 'submit' | 'audio' | 'restart';
}
export declare function captchaInteract(request: CaptchaRequest, options: {
    port?: number;
    host?: string;
}): Promise<any>;
export declare function focusTab(tabPattern: string, options: {
    port?: number;
    host?: string;
}): Promise<{
    id: string;
    title: string;
    url: string;
}>;
