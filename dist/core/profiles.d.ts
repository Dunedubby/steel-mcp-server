import type { ProfileName } from './config.js';
import type { ServerDeps, ToolHost } from './context.js';
export interface ToolDefinition {
    name: string;
    /** Profiles this tool belongs to. */
    profiles: ProfileName[];
    register(host: ToolHost, deps: ServerDeps): void;
}
/**
 * The tool table, in the order `tools/list` returns them.
 *
 * The order is fixed here rather than derived from a map, because a stable ordering is what makes
 * a host's prompt cache hit across connections.
 */
export declare const TOOL_TABLE: ToolDefinition[];
/** The tools a profile exposes, in `tools/list` order. */
export declare function toolsForProfile(profile: ProfileName): ToolDefinition[];
