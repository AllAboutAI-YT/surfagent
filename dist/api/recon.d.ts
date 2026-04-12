export interface ReconResult {
    url: string;
    title: string;
    tabId: string;
    timestamp: string;
    meta: {
        description: string | null;
        ogTitle: string | null;
        ogDescription: string | null;
        jsonLd: any[];
    };
    headings: {
        level: number;
        text: string;
    }[];
    navigation: {
        text: string;
        href: string;
        section: string | null;
    }[];
    elements: {
        tag: string;
        text: string;
        type: string | null;
        href: string | null;
        id: string | null;
        selector: string;
        role: string | null;
        x: number;
        y: number;
    }[];
    forms: {
        action: string | null;
        method: string | null;
        id: string | null;
        fields: {
            tag: string;
            type: string | null;
            name: string | null;
            id: string | null;
            label: string | null;
            placeholder: string | null;
            required: boolean;
            options: string[] | null;
            selector: string;
        }[];
    }[];
    contentSummary: string;
    landmarks: {
        role: string;
        label: string | null;
        tag: string;
    }[];
    overlays: {
        type: string;
        text: string;
        selector: string;
    }[];
    captchas: {
        type: string;
        src: string;
    }[];
}
export declare function reconUrl(url: string, options: {
    port?: number;
    host?: string;
    waitMs?: number;
    keepTab?: boolean;
}): Promise<ReconResult>;
export declare function reconTab(tabPattern: string, options: {
    port?: number;
    host?: string;
}): Promise<ReconResult>;
