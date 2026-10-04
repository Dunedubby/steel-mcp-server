import { type McpHttpHandler } from '@modelcontextprotocol/server';
import type { ServerDeps } from './core/context.js';
export interface RequestDepsInput {
    /** Raw Steel credential for clients that must authenticate to Steel on this request. */
    credential: string;
    /** One-way identifier used to authorise every session-handle lookup. */
    principal: string;
    /** The credential-free request passed through to the MCP server factory. */
    request: Request;
}
export interface SteelHttpHandlerOptions {
    /** Host header allowlist, as hostnames without ports. */
    allowedHostnames: string[];
    /** Browser Origin allowlist, as hostnames without schemes or ports. */
    allowedOriginHostnames: string[];
    /**
     * Constructs request-scoped dependencies from the caller's own credential.
     *
     * Shared registries, credential-keyed pools and the cost-weighted request limiter belong behind
     * this seam; the boundary never reuses one caller's Steel clients for another caller.
     * `HostedRuntime` is the implementation this deployment uses, and it supplies all three.
     */
    depsForRequest(input: RequestDepsInput): ServerDeps | Promise<ServerDeps>;
    onerror?: ((error: Error) => void) | undefined;
}
/** Builds the hosted, stateless fetch handler shared by Node and other web-standard runtimes. */
export declare function createSteelHttpHandler(options: SteelHttpHandlerOptions): McpHttpHandler;
