export declare const REAPER_INTERVAL_MS = 30000;
export declare const DEFAULT_INACTIVITY_TIMEOUT_MS = 600000;
export declare const DEFAULT_SESSION_TIMEOUT_MS = 900000;
export declare const HANDOFF_GRACE_MS = 600000;
/** Gives Steel's remote-input clock one sweep of slack before local MCP cleanup. */
export declare function resolveRegistryIdleMs(inactivityTimeoutMs: number): number;
