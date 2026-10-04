/**
 * The named tool presets a connection can select.
 *
 * PLAN §7 also designs `vision` (coordinate tools over Steel's `/computer` endpoint) and `full`
 * (`steel_execute_js`, self-host and stdio only). Neither has tools of its own yet, so neither is
 * offered: a preset a caller can name has to differ from the one next to it, or the name promises a
 * capability the server does not have.
 */
export declare const PROFILE_NAMES: readonly ['scrape', 'browse'];
export type ProfileName = (typeof PROFILE_NAMES)[number];
export type Deployment = 'cloud' | 'self_hosted';
/** Everything the server needs to reach a Steel deployment. */
export interface SteelConfig {
    /** Absent only on a self-hosted deployment, which has no API-key auth. */
    apiKey: string | undefined;
    /** REST base URL with no trailing slash and no `/v1` suffix. */
    baseUrl: string;
    /**
     * Proxy every session this server creates is bound to, sent to Steel as `proxyUrl`
     * (`scheme://user:pass@host:port`). Read from `STEEL_PROXY_URL`. For a self-hosted
     * steel-browser this is the only way to give sessions a proxy: `useProxy` selects from
     * Steel Cloud's pool, which a self-hosted deployment does not have, and steel-browser's
     * own `PROXY_URL` is not applied to sessions. Undefined means the browser's own route.
     */
    proxyUrl: string | undefined;
    /** WebSocket origin for CDP connections. */
    connectUrl: string;
    deployment: Deployment;
    profile: ProfileName;
    /**
     * Hard cap on simultaneous browser sessions. Self-hosted steel-browser runs exactly one;
     * the cloud value is refined from `GET /v1/details` at runtime.
     */
    maxConcurrentSessions: number;
    /** Idle release, in ms, set on every session so a browser frees itself if this process dies. */
    inactivityTimeoutMs: number;
    /**
     * Hard session cap, in ms. Clamped at runtime to the plan maximum when `GET /v1/details` reports
     * one. The API does not always report a maximum, so this remains a requested default rather than
     * being treated as an invented ceiling; Steel is authoritative for account validation.
     */
    sessionTimeoutMs: number;
    /**
     * HMAC key for the multi-round-trip `requestState` a human-in-the-loop handoff round-trips
     * through the client.
     *
     * Read from `STEEL_REQUEST_STATE_SECRET` when the operator supplies one; otherwise a fresh
     * per-process key. That default is correct for one process serving every round of a flow, and
     * wrong for a multi-replica deployment, where a retry landing on another replica cannot verify
     * state this one minted and the caller sees `Invalid or expired requestState`.
     */
    requestStateSecret: string;
    /** Configuration problems worth telling the operator about, logged by the entrypoint. */
    warnings: string[];
}
/** Removes a trailing `/v1` and any trailing slashes, reconciling the SDK and CLI conventions. */
export declare function normalizeBaseUrl(raw: string): string;
/** Builds the configuration from a process environment, failing loudly on an unusable combination. */
export declare function loadConfig(env: Record<string, string | undefined>): SteelConfig;
/** Where handle records live, which is what decides whether replicas can serve each other's handles. */
export interface RegistryConfig {
    /** Absent means records stay in this process, which is correct for exactly one replica. */
    redisUrl: string | undefined;
    /** Key namespace, so one store can hold more than one deployment's records. */
    keyPrefix: string;
}
/**
 * Reads the handle-registry backend from the environment.
 *
 * The URL is checked but never echoed: it usually carries a password, and an unusable value must
 * fail here rather than send that password to whatever happens to answer.
 *
 * This is also where a shared store and a per-process handoff key are refused as a pair. The check
 * belongs here rather than in `loadConfig` because only a deployment that actually shares handles
 * calls this, so the stdio entrypoint — where `REDIS_URL` may be set for something else entirely
 * and means nothing — is never affected by it.
 */
export declare function loadRegistryConfig(env: Record<string, string | undefined>): RegistryConfig;
/**
 * Picks the idle timeout to send with a session, always strictly below the hard timeout.
 *
 * Steel ignores `inactivityTimeout` entirely when it is greater than or equal to `timeout`. Sending
 * an equal value therefore silently disables the one teardown layer that survives this process
 * dying, its replica being rescheduled, and the client vanishing. Returns `undefined` when no
 * useful value exists, so an inert number is never sent at all.
 */
export declare function resolveInactivityTimeout(configuredMs: number, hardTimeoutMs: number): number | undefined;
/** The subset of configuration a CDP URL is built from. */
export type CdpEndpoint = Pick<SteelConfig, 'deployment' | 'connectUrl'> & {
    apiKey?: string | undefined;
};
/**
 * Builds the CDP WebSocket URL for a session.
 *
 * `sessionId` is mandatory: connecting to Steel without one makes it create a fresh billed
 * session that nothing in this process knows about, so an empty id is a programming error.
 */
export declare function buildCdpUrl(endpoint: CdpEndpoint, sessionId: string): string;
