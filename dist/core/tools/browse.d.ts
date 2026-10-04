import type { ServerDeps, ToolHost } from '../context.js';
import { type BrowserPage } from '../page.js';
/** Captures and renders a fenced, budgeted snapshot section for a tool that was asked for one. */
export declare function snapshotSection(page: BrowserPage, deps: ServerDeps, options: {
    interactiveOnly?: boolean;
    maxTokens?: number | undefined;
    cursor?: string | undefined;
}): Promise<{
    pageState: string;
    snapshot: string;
    pagination: string | undefined;
}>;
export declare function registerNavigate(host: ToolHost, deps: ServerDeps): void;
export declare function registerSnapshot(host: ToolHost, deps: ServerDeps): void;
export declare function registerFind(host: ToolHost, deps: ServerDeps): void;
export declare function registerAct(host: ToolHost, deps: ServerDeps): void;
export declare function registerWaitFor(host: ToolHost, deps: ServerDeps): void;
