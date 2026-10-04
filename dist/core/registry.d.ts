import type { MitigationState } from './errors.js';
import { SteelToolError } from './errors.js';
/** Why this registry successfully finalized a browser session. */
export type ReleasePath = 'explicit' | 'stream_close' | 'idle' | 'hard_expiry';
/** Exclusive, short-lived authority for a person to drive the remote browser. */
export interface HumanControlLease {
    /** Opaque fencing token. Only the viewer that acquired it may renew or release it. */
    token: string;
    /** Lease deadline. It never extends the session's immutable hard expiry. */
    leaseUntil: number;
}
export interface HandleRecord {
    /** Opaque, CSPRNG-derived, never a capability on its own. */
    handle: string;
    /** The Steel session this handle points at. */
    steelSessionId: string;
    /** The principal allowed to use this handle. Re-checked on every call. */
    principal: string;
    createdAt: number;
    lastUsedAt: number;
    /** Hard deadline; past this the handle is refused even if Steel has not reclaimed it yet. */
    expiresAt: number;
    viewerUrl?: string | undefined;
    /** The create request proved this client rendered the session's inline viewer. */
    inlineViewer?: boolean | undefined;
    /**
     * The self-contained live player for this session — the URL a person is handed to finish a
     * step by hand. Unauthenticated, and whoever holds it can drive the browser.
     */
    debugUrl?: string | undefined;
    /**
     * Until this instant, an elicitation is outstanding and the idle sweep leaves the handle alone.
     *
     * Steel's `inactivityTimeout` counts remote input in the live session, so a person working in
     * the player keeps the browser alive; our idle clock only sees tool calls, and a human takes
     * longer than any idle budget worth setting. During a handoff ours is the less informed clock,
     * so it defers. The hard expiry below is untouched, and so are both Steel timeouts, which
     * remain the actual guarantee — this only suspends our slot-reclamation optimisation, and only
     * for a bounded window, so a person who walks away still frees the slot.
     */
    awaitingInputUntil?: number | undefined;
    /** Present only while an authenticated viewer owns exclusive browser control. */
    humanControl?: HumanControlLease | undefined;
    /** Release fencing: once true, no new agent or viewer ownership may begin. */
    releasing?: boolean | undefined;
    /**
     * How many human-in-the-loop handoffs this handle has already been offered.
     *
     * Lives here rather than in the process because the bound has to hold for a client that never
     * echoes the signed state back: a retry may be served by any replica, and one that had never
     * seen the handle would otherwise start counting from zero and interrupt a person again.
     */
    handoffRounds: number;
    /** Session capabilities already in play, so bot-detection errors name the right next rung. */
    mitigation: MitigationState;
}
export interface CreateHandleInput {
    principal: string;
    steelSessionId: string;
    expiresAt: number;
    viewerUrl?: string | undefined;
    inlineViewer?: boolean | undefined;
    debugUrl?: string | undefined;
    mitigation?: MitigationState | undefined;
}
export interface ReapOptions {
    /** Release a handle that has not been used for this long. */
    idleMs: number;
}
/** The storage-shaped contract; the in-memory backend is the stdio and self-host implementation. */
export interface HandleRegistry {
    readonly shutdownScope: 'process_owned' | 'shared';
    readonly registryBackend: 'memory' | 'redis';
    create(input: CreateHandleInput): Promise<HandleRecord>;
    resolve(handle: string, principal: string): Promise<HandleRecord>;
    touch(handle: string): Promise<void>;
    /** Resolve a handle for a model page operation, refusing it while a person owns control. */
    resolveForAgent(handle: string, principal: string): Promise<HandleRecord>;
    acquireHumanControl(handle: string, principal: string, leaseMs: number): Promise<HumanControlLease>;
    renewHumanControl(handle: string, principal: string, token: string, leaseMs: number): Promise<HumanControlLease>;
    releaseHumanControl(handle: string, principal: string, token: string): Promise<void>;
    /** Suspends idle reclamation until `untilMs` while a person finishes a step in the live session. */
    awaitInput(handle: string, untilMs: number): Promise<void>;
    /**
     * Counts one handoff against the handle and returns the round it is.
     *
     * Atomic, so two replicas offering a handoff at the same moment cannot be handed the same round
     * number and talk one extra person into the browser between them.
     */
    recordHandoff(handle: string): Promise<number>;
    reserveProfileWriter(principal: string, profileId: string, ownerSteelSessionId: string, untilMs: number): Promise<boolean>;
    releaseProfileWriter(principal: string, profileId: string, ownerSteelSessionId: string): Promise<void>;
    release(handle: string, principal: string, path: ReleasePath): Promise<HandleRecord | null>;
    list(principal: string): Promise<HandleRecord[]>;
    countLive(principal: string): Promise<number>;
    /** Counts pending creates and live sessions together, atomically across callers. */
    reserveSessionSlot(principal: string, steelSessionId: string, expiresAt: number, limit: number): Promise<boolean>;
    releaseSessionSlot(principal: string, steelSessionId: string): Promise<void>;
    reap(options: ReapOptions): Promise<number>;
    /** Releases every process-owned record during transport/runtime shutdown. Shared stores no-op. */
    releaseAll(path: 'stream_close'): Promise<number>;
    releaseCounts(): Record<ReleasePath, number>;
}
export interface RegistryDeps {
    /**
     * Called exactly once per handle, on whichever release path fires first.
     *
     * The record's principal comes along because releasing a Steel session needs that principal's
     * credential, and a replica that did not create the session has no other way to find it.
     */
    releaseSteelSession(steelSessionId: string, principal: string): Promise<void>;
    /** Reaper failures are reported here rather than thrown, so one bad session cannot stall a sweep. */
    onReapError?: ((error: unknown) => void) | undefined;
    /** Best-effort, low-cardinality notification after irreversible successful finalization. */
    onReleased?: ((cause: ReleasePath) => void) | undefined;
}
/**
 * Derives a stable principal id from a credential.
 *
 * The credential itself never enters a handle, a log line or an error message; only this
 * one-way digest does, so a leaked registry dump does not leak API keys.
 */
export declare function principalFromCredential(credential: string): string;
/**
 * The one error for an unknown handle and for someone else's handle.
 *
 * Every backend raises exactly this, so the error cannot be used to probe for the existence of
 * other people's sessions.
 */
export declare function handleNotFoundError(): SteelToolError;
/** The distinct error for a handle that is ours but has passed its hard deadline. */
export declare function handleExpiredError(handle: string): SteelToolError;
/** Mints an opaque handle. Shared by every backend so entropy and prefix never diverge. */
export declare function mintHandle(): string;
export declare function mintControlToken(): string;
export declare function humanControlError(leaseUntil?: number): SteelToolError;
export declare function sessionReleasingError(): SteelToolError;
/** In-memory handle registry. One process, one replica; the hosted deployment swaps the backend. */
export declare class InMemoryHandleRegistry implements HandleRegistry {
    private readonly deps;
    readonly shutdownScope: 'process_owned';
    readonly registryBackend: 'memory';
    private readonly records;
    private readonly sessionSlots;
    private readonly profileWriters;
    private readonly counts;
    constructor(deps: RegistryDeps);
    private finalized;
    create(input: CreateHandleInput): Promise<HandleRecord>;
    resolve(handle: string, principal: string): Promise<HandleRecord>;
    touch(handle: string): Promise<void>;
    resolveForAgent(handle: string, principal: string): Promise<HandleRecord>;
    acquireHumanControl(handle: string, principal: string, leaseMs: number): Promise<HumanControlLease>;
    renewHumanControl(handle: string, principal: string, token: string, leaseMs: number): Promise<HumanControlLease>;
    releaseHumanControl(handle: string, principal: string, token: string): Promise<void>;
    awaitInput(handle: string, untilMs: number): Promise<void>;
    recordHandoff(handle: string): Promise<number>;
    reserveProfileWriter(principal: string, profileId: string, owner: string, until: number): Promise<boolean>;
    releaseProfileWriter(principal: string, profileId: string, owner: string): Promise<void>;
    /**
     * Releases the Steel session, then forgets the handle.
     *
     * The order matters: deleting the record first would lose it on a transient failure, leaving
     * nothing to retry, nothing for the reaper to find, and a browser billing on — while the
     * release counter still claimed a release that never happened.
     */
    release(handle: string, principal: string, path: ReleasePath): Promise<HandleRecord | null>;
    list(principal: string): Promise<HandleRecord[]>;
    countLive(principal: string): Promise<number>;
    reserveSessionSlot(principal: string, owner: string, expiresAt: number, limit: number): Promise<boolean>;
    releaseSessionSlot(principal: string, owner: string): Promise<void>;
    reap(options: ReapOptions): Promise<number>;
    releaseAll(path: 'stream_close'): Promise<number>;
    releaseCounts(): Record<ReleasePath, number>;
}
