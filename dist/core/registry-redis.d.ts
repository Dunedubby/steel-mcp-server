import { type CreateHandleInput, type HandleRecord, type HandleRegistry, type ReapOptions, type RegistryDeps, type ReleasePath } from './registry.js';
/**
 * The Redis commands this registry issues, and nothing more.
 *
 * Keeping the surface this small is what lets the whole state machine be tested against an
 * in-memory store: no server, no client library, no network in the unit suite.
 */
export interface RedisCommands {
    get(key: string): Promise<string | null>;
    /**
     * Writes a value with a millisecond time-to-live.
     *
     * The TTL is a garbage-collection net for records no replica ever sweeps, never a release
     * path: it is always set far beyond the handle's own hard expiry.
     */
    set(key: string, value: string, ttlMs: number): Promise<void>;
    /** SET NX PX: claims a missing expiring key atomically. */
    setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
    /** Replaces an expiring value only when its current bytes match `expected`. */
    compareSet(key: string, expected: string, value: string, ttlMs: number): Promise<boolean>;
    /** Deletes a value only when its current bytes match `expected`. */
    compareDelete(key: string, expected: string): Promise<boolean>;
    /** Returns how many keys were removed, which is how one of two concurrent sweepers wins. */
    del(key: string): Promise<number>;
    /**
     * Atomically adds one to the integer at `key` and returns the new value.
     *
     * A missing key counts as zero, so the first call returns 1. Redis creates that key with no
     * expiry at all and an increment never changes an existing one, so a TTL is `pexpire`'s job.
     */
    incr(key: string): Promise<number>;
    /** Puts a millisecond time-to-live on a key that exists. A missing key is left alone. */
    pexpire(key: string, ttlMs: number): Promise<void>;
    sadd(key: string, member: string): Promise<void>;
    srem(key: string, member: string): Promise<void>;
    smembers(key: string): Promise<string[]>;
}
export interface RedisRegistryDeps extends RegistryDeps {
    commands: RedisCommands;
    /** Key namespace, so one Redis can serve more than one deployment. */
    keyPrefix?: string | undefined;
    now?: (() => Date) | undefined;
}
/** Handle registry over a shared Redis, so any replica can serve a handle any other replica minted. */
export declare class RedisHandleRegistry implements HandleRegistry {
    private readonly deps;
    readonly shutdownScope: 'shared';
    readonly registryBackend: 'redis';
    private readonly commands;
    private readonly prefix;
    private readonly now;
    private readonly counts;
    constructor(deps: RedisRegistryDeps);
    private finalized;
    private recordKey;
    /**
     * Keys holding fields that change after creation.
     *
     * The first three are each owned by one operation. Human/release ownership shares `control`,
     * where SET-NX and compare-and-set provide the atomic fencing a plain record rewrite cannot.
     * A handle is base64url, so no suffix can collide with another handle's record key.
     */
    private usedKey;
    private awaitKey;
    private roundsKey;
    private controlKey;
    private profileWriterKey;
    /** Index of one principal's handles, so a count or a list never scans another tenant's records. */
    private principalKey;
    /** Index every reaper sweeps, holding `<principal>:<handle>` members. */
    private get liveKey();
    /** Reassembles a record from its immutable JSON and four keys holding mutable fields. */
    private read;
    /**
     * Writes the immutable record. Called once per handle, by `create` and nothing else.
     *
     * That it is written exactly once is what makes a released handle unresurrectable: no later
     * operation can put the record back after a `release` has deleted it.
     */
    private write;
    /**
     * Removes a record, all four mutable-field keys and both index entries.
     *
     * Returns whether this caller was the one that removed the record. Two replicas sweeping at
     * once both see the handle, so `del` of the record deciding the winner is what keeps the
     * release counters honest without a distributed lock — which is also why it goes first.
     */
    private forget;
    create(input: CreateHandleInput): Promise<HandleRecord>;
    resolve(handle: string, principal: string): Promise<HandleRecord>;
    /**
     * Records a real call against the handle.
     *
     * Deliberately reads nothing. Writing a value derived from a record read a round trip earlier
     * is what let a touch put back a record another replica had just released, and undo a handoff
     * another replica had just registered. Both writes here are single-key and unconditional, so
     * concurrent operations resolve in the order Redis runs them, exactly as they do in one process.
     *
     * The cost is that an unknown handle leaves a stray key behind rather than doing nothing. No
     * caller reaches this without a successful `resolve` first, and the key expires by itself.
     */
    touch(handle: string): Promise<void>;
    resolveForAgent(handle: string, principal: string): Promise<HandleRecord>;
    acquireHumanControl(handle: string, principal: string, leaseMs: number): Promise<{
        token: string;
        leaseUntil: number;
    }>;
    renewHumanControl(handle: string, principal: string, token: string, leaseMs: number): Promise<{
        token: string;
        leaseUntil: number;
    }>;
    releaseHumanControl(handle: string, principal: string, token: string): Promise<void>;
    awaitInput(handle: string, untilMs: number): Promise<void>;
    /**
     * Counts one handoff against the handle, atomically across replicas.
     *
     * `incr` is the whole point: read-then-write would hand the same round number to two replicas
     * offering a handoff at the same moment, and one extra person would be pulled into the browser
     * between them. The expiry is a second command because Redis creates a counter key with none,
     * and it is refreshed every round rather than only the first, as the other two keys are.
     */
    recordHandoff(handle: string): Promise<number>;
    reserveProfileWriter(principal: string, profileId: string, owner: string, until: number): Promise<boolean>;
    releaseProfileWriter(principal: string, profileId: string, owner: string): Promise<void>;
    /**
     * Releases the Steel session, then forgets the handle.
     *
     * The order matters: deleting the record first would lose it on a transient failure, leaving
     * nothing to retry, nothing for any replica's reaper to find, and a browser billing on — while
     * the release counter still claimed a release that never happened.
     */
    release(handle: string, principal: string, path: ReleasePath): Promise<HandleRecord | null>;
    /** Keep the handle indexed until both ledgers are clean, so any replica can retry a failure. */
    private releaseLedgers;
    list(principal: string): Promise<HandleRecord[]>;
    countLive(principal: string): Promise<number>;
    /** CAS keeps pending creations and live sessions in one expiring per-principal capacity ledger. */
    private updateSessionSlots;
    reserveSessionSlot(principal: string, owner: string, expiresAt: number, limit: number): Promise<boolean>;
    releaseSessionSlot(principal: string, owner: string): Promise<void>;
    /**
     * Sweeps every principal's handles, releasing the idle and the expired.
     *
     * A short-lived control marker fences concurrent releases. Steel release and ledger cleanup
     * are idempotent so failures can be retried; only removal of the record counts a release.
     */
    reap(options: ReapOptions): Promise<number>;
    releaseAll(_path: 'stream_close'): Promise<number>;
    /** This replica's own counts. The leak metric is their sum across the fleet. */
    releaseCounts(): Record<ReleasePath, number>;
}
