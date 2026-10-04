import type { ServerDeps, ToolHost } from '../context.js';
/** Accepts only login-safe Steel dashboard links, never a credential-bearing or lookalike URL. */
export declare function safeDashboardUrl(raw: string | undefined, steelSessionId: string): string | undefined;
/** Registers the public, read-only finished-session dashboard resolver. */
export declare function registerSessionReplay(host: ToolHost, deps: ServerDeps): void;
