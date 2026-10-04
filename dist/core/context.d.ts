import type { McpServer, RequestStateCodec } from '@modelcontextprotocol/server';
import type { Tracer } from '@opentelemetry/api';
import type { SteelConfig } from './config.js';
import type { HandoffState } from './mrtr.js';
import { BrowserPage } from './page.js';
import type { RateLimiter } from './rate-limit.js';
import type { HandleRegistry } from './registry.js';
import type { SessionPlanState } from './session-plan.js';
import { type CdpSession } from './steel/cdp.js';
import type { SteelApi } from './steel/types.js';
/**
 * The registration surface handed to the tool modules.
 *
 * Narrower than `McpServer` on purpose: because a tool can only register itself through it, the
 * hosted entry can hand over a wrapper that charges the request budget before any handler runs,
 * and a tool added later is metered without anyone having to remember to ask for it. `server` is
 * passed through unwrapped so a tool can read connect-time client capabilities.
 */
export type ToolHost = Pick<McpServer, 'registerTool' | 'server'>;
/** Hands out the attached page for a Steel session, creating the CDP connection on first use. */
export interface SessionPool {
    page(steelSessionId: string, signal?: AbortSignal): Promise<BrowserPage>;
    close(steelSessionId: string): Promise<void>;
    closeAll(): Promise<void>;
}
/** Everything the tool layer needs. Held at module scope and closed over by the server factory. */
export interface ServerDeps {
    /** Pins hosted clients for one tool operation; the returned callback releases the pin. */
    beginTool?: (() => () => void) | undefined;
    config: SteelConfig;
    api: SteelApi;
    registry: HandleRegistry;
    pool: SessionPool;
    /**
     * Seals and verifies the multi-round-trip state a human-in-the-loop handoff round-trips.
     *
     * Injected rather than derived per request because every replica that might receive the retry
     * has to hold the same key; a per-instance codec would reject its own flow's second round.
     */
    handoffState: RequestStateCodec<HandoffState>;
    /** Signs planner settings for this principal; verified manually by session creation. */
    sessionPlanState: RequestStateCodec<SessionPlanState>;
    /** The principal for this request's own credential; handles are re-authorised against it. */
    principal: string;
    /**
     * Cost-weighted admission control for this principal.
     *
     * Absent on stdio: one process serves one credential there, so there is no neighbour to
     * protect and a budget would only stop the single tenant from using what it already pays for.
     */
    limiter?: RateLimiter | undefined;
    /**
     * Multiplier applied to settle budgets, because Steel sessions reach the internet through
     * Steel's fleet and often a proxy, so the localhost-tuned constants are too tight.
     */
    settleMultiplier: number;
    now(): Date;
    /** Downloads hosted screenshots so tool results can embed them for chat UIs. */
    artifactFetch?: typeof globalThis.fetch | undefined;
    /** Test seam for the one managed-credential injection grace; production uses an abort-aware 2s wait. */
    credentialGrace?: ((signal?: AbortSignal) => Promise<void>) | undefined;
    /** Overridable so tests get deterministic Steel session ids. */
    newSessionId?: (() => string) | undefined;
    /**
     * Tracer the tool layer opens its per-call spans on. Left unset, the globally registered
     * OpenTelemetry tracer is used, which is a no-op until an entrypoint configures an exporter.
     */
    tracer?: Tracer | undefined;
}
/** Mints the session UUID before the create call, closing the create-then-crash gap. */
export declare function mintSteelSessionId(deps: ServerDeps): string;
/** The connection behaviour the pool depends on, so tests can supply one without a socket. */
export interface PooledConnection {
    attachToPage(): Promise<CdpSession>;
    close(): Promise<void>;
    readonly isClosed: boolean;
}
/** Opens a CDP connection to a URL. Injected so the pool's lifecycle is testable on its own. */
export type CdpConnector = (url: string, signal?: AbortSignal) => Promise<PooledConnection>;
/**
 * Opens one CDP connection per Steel session and keeps the attached page for later calls.
 *
 * The map holds the in-flight connect promise rather than the finished entry, so concurrent
 * callers share one connection instead of racing to open several — a loser's socket would leak
 * for the session's whole life, and ref state would split across two `PageState` instances.
 */
export declare class CdpSessionPool implements SessionPool {
    private readonly config;
    private readonly settleMultiplier;
    private readonly connect;
    private readonly tracer;
    private readonly entries;
    constructor(config: SteelConfig, settleMultiplier: number, connect?: CdpConnector, tracer?: Tracer);
    private open;
    private openConnection;
    page(steelSessionId: string, signal?: AbortSignal): Promise<BrowserPage>;
    close(steelSessionId: string): Promise<void>;
    closeAll(): Promise<void>;
}
