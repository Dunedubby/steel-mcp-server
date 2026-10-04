import { SteelToolError } from './errors.js';
/**
 * The admission-control contract.
 *
 * `charge` is async so the in-memory bucket can be swapped for a shared store (one budget across
 * replicas) without touching a single call site.
 */
export interface RateLimiter {
    /**
     * Charges one call of `toolName` to `principal`.
     *
     * Resolves when the call is admitted, and throws a `rate_limited` {@link SteelToolError} that
     * names the limit and a retry-after when it is not.
     */
    charge(principal: string, toolName: string): Promise<void>;
}
/**
 * What one call of each tool costs, in budget units. This table is the tuning surface.
 *
 * It protects two scarce resources, and neither of them is money: a fully leaked 15-minute Launch
 * session costs $0.025, while a **concurrency slot** is one of ten on Launch, and every **Browser
 * Tools call** spends one of the twenty per minute the whole org shares. So the weights track
 * which of those two a call consumes:
 *
 * - `steel_session_create` claims a concurrency slot for minutes, so it is the most expensive call
 *   on the surface by a wide margin.
 * - `steel_batch` fans out to many CDP round-trips inside one request.
 * - `steel_navigate`, `steel_act` and `steel_snapshot` each keep a live session busy.
 * - `steel_find`, `steel_wait_for` and `steel_session_diagnostics` work against a session that is
 *   already open and add no new load of their own.
 * - `steel_scrape`, `steel_screenshot` and `steel_pdf` are single Browser Tools calls that start no
 *   session, so they are the cheapest thing a rate-limited agent can be steered towards.
 * - `steel_session_live_view` is one session read for the inline viewer. It touches no browser and
 *   spends no Browser Tools call, and the app re-asks for it whenever its stream reconnects, so
 *   pricing it like a navigation would let a flapping viewer eat an agent's whole budget.
 * - `steel_session_replay` reads one finished session and returns its safe dashboard link. It starts no
 *   browser and consumes no concurrency slot, so it costs the same as another stateless read.
 * - `steel_session_release` is free: charging for handing a slot back would protect nothing and
 *   would keep a browser billing while its owner waited out a budget.
 */
export declare const TOOL_COSTS: Readonly<Record<string, number>>;
/** Charged to a tool the table does not name, so a tool added later is never accidentally free. */
export declare const DEFAULT_TOOL_COST = 3;
/** The cost of one call of a tool, in budget units. */
export declare function toolCost(toolName: string): number;
export interface RateLimitPolicy {
    /** Budget units restored per minute. The sustained rate a principal may keep up forever. */
    refillPerMinute: number;
    /** Bucket size: how much unspent budget a principal may save up and spend at once. */
    burstCapacity: number;
}
/**
 * The shipped budget.
 *
 * 20 units/minute is Steel's per-org Browser Tools cap expressed in units, so a caller doing
 * nothing but `steel_scrape` paces exactly at that limit instead of collecting 429s. The 40-unit
 * bucket is two minutes of budget, which absorbs an agent's opening burst while still capping
 * sustained `steel_session_create` at two per minute. Steel enforces the independent concurrency
 * ceiling, while the MCP budget prevents a caller from hammering session creation up to that edge.
 */
export declare const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy;
/** The name a rejection uses for itself, so an operator can grep it and a model can quote it. */
export declare const RATE_LIMIT_NAME = "hosted request budget";
export interface RateLimitRejection {
    toolName: string;
    cost: number;
    availableUnits: number;
    policy: RateLimitPolicy;
}
/**
 * Builds the rejection error.
 *
 * A bare failure would leave the model with nothing to do but retry blindly, so the text names
 * which limit refused the call, what the call cost, when the budget will cover it, and the two
 * cheaper moves available right now.
 */
export declare function rateLimitedError(rejection: RateLimitRejection): SteelToolError;
export interface RateLimiterOptions {
    policy?: RateLimitPolicy | undefined;
    /** Injected so refill is testable without sleeping, matching the clock in `ServerDeps`. */
    now?: (() => Date) | undefined;
}
/**
 * A token bucket per principal.
 *
 * A bucket beats a sliding window here because it holds two numbers per principal instead of a
 * timestamp per call: the memory is bounded by tenants rather than by traffic, and the same two
 * numbers port to a shared store as one atomic hash. The bucket also expresses the thing being
 * protected directly — a sustained rate plus a burst allowance — which a window does not.
 */
export declare class InMemoryRateLimiter implements RateLimiter {
    private readonly buckets;
    private readonly policy;
    private readonly now;
    constructor(options?: RateLimiterOptions);
    charge(principal: string, toolName: string): Promise<void>;
    private refilled;
    private prune;
}
