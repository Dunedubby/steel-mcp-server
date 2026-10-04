import type { ServerDeps, ToolHost } from '../context.js';
/**
 * Registered only when roots are configured: a tool that can never succeed is noise in the list.
 */
export declare function registerUploadFile(host: ToolHost, deps: ServerDeps): void;
