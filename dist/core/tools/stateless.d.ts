import type { ServerDeps, ToolHost } from '../context.js';
export declare const MAX_INLINE_SCREENSHOT_BYTES: number;
export declare function registerScrape(host: ToolHost, deps: ServerDeps): void;
export declare function registerScreenshot(host: ToolHost, deps: ServerDeps): void;
export declare function registerPdf(host: ToolHost, deps: ServerDeps): void;
