import { type ServerDeps, type ToolHost } from '../context.js';
/** Short enough to recover from a vanished viewer, long enough to survive one missed heartbeat. */
export declare const HUMAN_CONTROL_LEASE_MS = 60000;
export declare function registerSessionCreate(host: ToolHost, deps: ServerDeps): void;
export declare function registerSessionRelease(host: ToolHost, deps: ServerDeps): void;
export declare function registerSessionLiveView(host: ToolHost, deps: ServerDeps): void;
export declare function registerSessionDiagnostics(host: ToolHost, deps: ServerDeps): void;
