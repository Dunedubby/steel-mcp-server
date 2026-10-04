import { type CallToolResult, inputRequired, type ServerContext } from '@modelcontextprotocol/server';
import type { ServerDeps, ToolHost } from '../context.js';
import { SteelToolError } from '../errors.js';
declare const reasons: readonly ['sensitive_input', 'file_upload', 'review', 'manual_step'];
type HandoffReason = (typeof reasons)[number];
export interface ManualHandoffRequest {
    host: ToolHost;
    deps: ServerDeps;
    ctx: ServerContext;
    handle: string;
    record: import('../registry.js').HandleRecord;
    reason: HandoffReason;
    /** The originating tool, bound into request state so a retry cannot replay another operation. */
    tool: string;
    /** Preserve the original actionable error when this client has no human-control route. */
    unavailableError?: SteelToolError | undefined;
}
/**
 * Pauses one live session for a manual step and, on hand-back, returns without replaying the
 * operation that requested help. This is shared by explicit handoff and safe pre-dispatch failures.
 */
export declare function resolveManualHandoff(request: ManualHandoffRequest): Promise<CallToolResult | ReturnType<typeof inputRequired>>;
/** Registers the ordinary human-control path; no detector or failure is required to invoke it. */
export declare function registerSessionHandoff(host: ToolHost, deps: ServerDeps): void;
export {};
