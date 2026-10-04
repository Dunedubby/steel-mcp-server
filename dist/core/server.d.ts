import { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from './context.js';
/** The MCP Apps extension, negotiated per request under `capabilities.extensions`. */
export declare const UI_EXTENSION_NAME = "io.modelcontextprotocol/ui";
/**
 * Builds a server instance.
 *
 * Called once per connection on stdio and once per request behind the HTTP entry, so it must stay
 * cheap: everything expensive lives in `deps`, created once at module scope and closed over here.
 */
export declare function createSteelMcpServer(deps: ServerDeps): McpServer;
