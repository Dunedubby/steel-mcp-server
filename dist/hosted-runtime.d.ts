import { type SteelConfig } from './core/config.js';
import { type ServerDeps, type SessionPool } from './core/context.js';
import { type RateLimiter } from './core/rate-limit.js';
import { type RedisConnection } from './core/redis.js';
import type { ReleasePath } from './core/registry.js';
import { type HandleRegistry, type RegistryDeps } from './core/registry.js';
import type { SteelApi } from './core/steel/types.js';
import type { RequestDepsInput } from './http.js';
export interface HostedRuntimeOptions {
    /** Builds the complete Steel endpoint/profile configuration for this caller. */
    configForCredential(credential: string): SteelConfig;
    createApi?: ((config: SteelConfig) => SteelApi) | undefined;
    createPool?: ((config: SteelConfig, settleMultiplier: number) => SessionPool) | undefined;
    /** Swap this for a shared backend when replicas must exchange handle records. */
    createRegistry?: ((deps: RegistryDeps) => HandleRegistry) | undefined;
    /** Swap this for a shared-store limiter when replicas must share one budget per principal. */
    createLimiter?: ((now: () => Date) => RateLimiter) | undefined;
    onReapError?: ((error: unknown) => void) | undefined;
    onReleased?: ((cause: ReleasePath, backend: 'memory' | 'redis') => void) | undefined;
    now?: (() => Date) | undefined;
    /** Maximum retained credential/client bundles in this process. New callers fail closed when full. */
    maxTenants?: number | undefined;
    /** Idle bundles without live sessions can be evicted by pruneIdleTenants. */
    tenantIdleMs?: number | undefined;
}
/**
 * Module-scope runtime for hosted HTTP serving.
 *
 * Handles are shared across request factories, while REST clients and CDP pools are keyed by the
 * one-way principal. Raw credentials stay only in their tenant client bundle, never in handles.
 */
export declare class HostedRuntime {
    private readonly options;
    readonly registry: HandleRegistry;
    /**
     * One cost-weighted budget per principal, shared by every request this runtime serves.
     *
     * The default backend is in memory and therefore **per replica**: two replicas currently grant
     * the same credential two independent budgets, so the effective ceiling is the budget times the
     * replica count. Pass `createLimiter` with a shared-store implementation once the hosted
     * deployment runs more than one replica and the ceiling has to be exact.
     */
    readonly limiter: RateLimiter;
    private readonly tenants;
    private readonly createApi;
    private readonly createPool;
    private readonly now;
    private readonly maxTenants;
    private readonly tenantIdleMs;
    private pruning;
    private closed;
    constructor(options: HostedRuntimeOptions);
    private tenantFor;
    depsForRequest: (input: RequestDepsInput) => ServerDeps;
    /**
     * Releases a Steel session through the client that is allowed to release it.
     *
     * The handle registry names the owning principal, so this works for a session another replica
     * created — as long as this replica has served a request from that principal and therefore holds
     * its credential. When it has not, the release fails on purpose: the record then survives for a
     * replica that can, and Steel's own inactivity timeout remains the backstop underneath.
     */
    private releaseOwnedSession;
    /** Called by the hosted reaper; active tools and every live/pending-handoff record pin a tenant. */
    pruneIdleTenants(): Promise<number>;
    private prune;
    close(): Promise<void>;
}
export interface HandleRegistryBackend {
    /** Pass as `createRegistry` to every runtime that must see the same handles. */
    createRegistry: (deps: RegistryDeps) => HandleRegistry;
    /** Closes the shared store. Close the runtimes first, so their shutdown sweep still has one. */
    close(): Promise<void>;
}
export interface HandleRegistryBackendOptions {
    env: Record<string, string | undefined>;
    /** Opens the shared store. The default connects to Redis; tests substitute their own. */
    connect?: ((url: string, onError: (error: unknown) => void) => RedisConnection) | undefined;
    /** Where store connection failures go. Required whenever a shared store is configured. */
    onError?: ((error: unknown) => void) | undefined;
    now?: (() => Date) | undefined;
}
/**
 * Picks where handle records live, from the environment.
 *
 * With `REDIS_URL` set, records go to Redis and any replica can serve a handle any other replica
 * minted — the whole point of round-robin routing with no sticky sessions. Without it, records stay
 * in this process, which is correct for a single replica and for the stdio entrypoint, where one
 * subprocess serves one credential and a shared store would buy nothing.
 */
export declare function createHandleRegistryBackend(options: HandleRegistryBackendOptions): HandleRegistryBackend;
