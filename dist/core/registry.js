// ABOUTME: The handle registry: mints opaque session handles, re-authorises them against the
// ABOUTME: caller's own principal on every call, releases idempotently and reaps orphans.
import { createHash, randomBytes } from 'node:crypto';
import { SteelToolError } from './errors.js';
/**
 * Derives a stable principal id from a credential.
 *
 * The credential itself never enters a handle, a log line or an error message; only this
 * one-way digest does, so a leaked registry dump does not leak API keys.
 */
export function principalFromCredential(credential) {
    return createHash('sha256').update(credential).digest('hex').slice(0, 32);
}
/** The message used for both an unknown handle and a handle belonging to someone else. */
const NOT_FOUND_MESSAGE = 'No live browser session for that session_id. It may have been released, may have expired, ' +
    'or may belong to a different credential. Call steel_session_create to start a new one.';
/**
 * The one error for an unknown handle and for someone else's handle.
 *
 * Every backend raises exactly this, so the error cannot be used to probe for the existence of
 * other people's sessions.
 */
export function handleNotFoundError() {
    return new SteelToolError(NOT_FOUND_MESSAGE, { code: 'not_found' });
}
/** The distinct error for a handle that is ours but has passed its hard deadline. */
export function handleExpiredError(handle) {
    return new SteelToolError('That browser session reached its hard timeout and has been released by Steel. ' +
        'Call steel_session_create to start a new one.', { code: 'session_expired', details: { handle } });
}
/** Mints an opaque handle. Shared by every backend so entropy and prefix never diverge. */
export function mintHandle() {
    return `sess_${randomBytes(16).toString('base64url')}`;
}
export function mintControlToken() {
    return `ctl_${randomBytes(16).toString('base64url')}`;
}
export function humanControlError(leaseUntil) {
    return new SteelToolError('A person currently has exclusive control of this browser. Wait for them to choose Hand back, then take a fresh snapshot before continuing.', {
        code: 'human_control_active',
        details: leaseUntil === undefined ? undefined : { control_expires_at: new Date(leaseUntil).toISOString() },
    });
}
export function sessionReleasingError() {
    return new SteelToolError('This browser session is already being released; no new action or takeover can start.', {
        code: 'session_releasing',
    });
}
/** In-memory handle registry. One process, one replica; the hosted deployment swaps the backend. */
export class InMemoryHandleRegistry {
    deps;
    shutdownScope = 'process_owned';
    registryBackend = 'memory';
    records = new Map();
    sessionSlots = new Map();
    profileWriters = new Map();
    counts = { explicit: 0, stream_close: 0, idle: 0, hard_expiry: 0 };
    constructor(deps) {
        this.deps = deps;
    }
    finalized(cause) {
        this.counts[cause] += 1;
        try {
            this.deps.onReleased?.(cause);
        }
        catch {
            // Observability is best-effort after an irreversible successful release.
        }
    }
    async create(input) {
        const now = Date.now();
        const record = {
            handle: mintHandle(),
            steelSessionId: input.steelSessionId,
            principal: input.principal,
            createdAt: now,
            lastUsedAt: now,
            expiresAt: input.expiresAt,
            viewerUrl: input.viewerUrl,
            inlineViewer: input.inlineViewer,
            debugUrl: input.debugUrl,
            handoffRounds: 0,
            mitigation: input.mitigation ?? {},
        };
        this.records.set(record.handle, record);
        return record;
    }
    async resolve(handle, principal) {
        const record = this.records.get(handle);
        // A handle belonging to another principal is answered exactly like an unknown handle,
        // so the error cannot be used to probe for the existence of other people's sessions.
        if (!record || record.principal !== principal) {
            throw handleNotFoundError();
        }
        if (record.expiresAt <= Date.now()) {
            throw handleExpiredError(handle);
        }
        return record;
    }
    async touch(handle) {
        const record = this.records.get(handle);
        if (!record)
            return;
        record.lastUsedAt = Date.now();
        // A real call arrived, so whatever a person was asked to do is over as far as the idle
        // clock is concerned; normal accounting resumes even if the handoff is re-issued below.
        record.awaitingInputUntil = undefined;
    }
    async resolveForAgent(handle, principal) {
        const record = await this.resolve(handle, principal);
        if (record.humanControl && record.humanControl.leaseUntil <= Date.now())
            record.humanControl = undefined;
        if (record.releasing)
            throw sessionReleasingError();
        if (record.humanControl)
            throw humanControlError(record.humanControl.leaseUntil);
        return record;
    }
    async acquireHumanControl(handle, principal, leaseMs) {
        const record = await this.resolve(handle, principal);
        const now = Date.now();
        if (record.releasing)
            throw sessionReleasingError();
        if (record.humanControl && record.humanControl.leaseUntil > now) {
            throw humanControlError(record.humanControl.leaseUntil);
        }
        const lease = { token: mintControlToken(), leaseUntil: Math.min(now + leaseMs, record.expiresAt) };
        record.humanControl = lease;
        return lease;
    }
    async renewHumanControl(handle, principal, token, leaseMs) {
        const record = await this.resolve(handle, principal);
        const now = Date.now();
        if (!record.humanControl || record.humanControl.token !== token || record.humanControl.leaseUntil <= now) {
            throw humanControlError(record.humanControl?.leaseUntil);
        }
        const lease = { token, leaseUntil: Math.min(now + leaseMs, record.expiresAt) };
        record.humanControl = lease;
        return lease;
    }
    async releaseHumanControl(handle, principal, token) {
        const record = await this.resolve(handle, principal);
        if (!record.humanControl || record.humanControl.token !== token)
            throw humanControlError();
        record.humanControl = undefined;
        record.awaitingInputUntil = undefined;
        record.lastUsedAt = Date.now();
    }
    async awaitInput(handle, untilMs) {
        const record = this.records.get(handle);
        if (record)
            record.awaitingInputUntil = untilMs;
    }
    async recordHandoff(handle) {
        const record = this.records.get(handle);
        if (!record)
            return 0;
        record.handoffRounds += 1;
        return record.handoffRounds;
    }
    async reserveProfileWriter(principal, profileId, owner, until) {
        const key = `${principal}\0${profileId}`;
        const current = this.profileWriters.get(key);
        if (current && current.until > Date.now() && current.owner !== owner)
            return false;
        this.profileWriters.set(key, { owner, until });
        return true;
    }
    async releaseProfileWriter(principal, profileId, owner) {
        const key = `${principal}\0${profileId}`;
        if (this.profileWriters.get(key)?.owner === owner)
            this.profileWriters.delete(key);
    }
    /**
     * Releases the Steel session, then forgets the handle.
     *
     * The order matters: deleting the record first would lose it on a transient failure, leaving
     * nothing to retry, nothing for the reaper to find, and a browser billing on — while the
     * release counter still claimed a release that never happened.
     */
    async release(handle, principal, path) {
        const record = this.records.get(handle);
        if (!record)
            return null;
        if (record.principal !== principal) {
            throw handleNotFoundError();
        }
        if (record.releasing)
            return null;
        if (path !== 'stream_close' && record.humanControl && record.humanControl.leaseUntil > Date.now()) {
            throw humanControlError(record.humanControl.leaseUntil);
        }
        record.releasing = true;
        try {
            await this.deps.releaseSteelSession(record.steelSessionId, record.principal);
        }
        catch (error) {
            record.releasing = false;
            throw error;
        }
        this.records.delete(handle);
        await this.releaseSessionSlot(principal, record.steelSessionId);
        if (record.mitigation.persistProfile && record.mitigation.profileId) {
            await this.releaseProfileWriter(record.principal, record.mitigation.profileId, record.steelSessionId);
        }
        this.finalized(path);
        return record;
    }
    async list(principal) {
        return [...this.records.values()].filter(record => record.principal === principal);
    }
    async countLive(principal) {
        return (await this.list(principal)).length;
    }
    async reserveSessionSlot(principal, owner, expiresAt, limit) {
        const now = Date.now();
        const slots = this.sessionSlots.get(principal) ?? new Map();
        for (const [id, until] of slots)
            if (until <= now)
                slots.delete(id);
        for (const record of this.records.values()) {
            if (record.principal === principal && record.expiresAt > now)
                slots.set(record.steelSessionId, record.expiresAt);
        }
        this.sessionSlots.set(principal, slots);
        if (expiresAt <= now || (!slots.has(owner) && slots.size >= limit))
            return false;
        slots.set(owner, expiresAt);
        return true;
    }
    async releaseSessionSlot(principal, owner) {
        const slots = this.sessionSlots.get(principal);
        slots?.delete(owner);
        if (slots?.size === 0)
            this.sessionSlots.delete(principal);
    }
    async reap(options) {
        const now = Date.now();
        for (const [principal, slots] of this.sessionSlots) {
            for (const [id, until] of slots)
                if (until <= now)
                    slots.delete(id);
            if (!slots.size)
                this.sessionSlots.delete(principal);
        }
        let reaped = 0;
        for (const record of [...this.records.values()]) {
            const awaitingHuman = (record.awaitingInputUntil ?? 0) > now || (record.humanControl?.leaseUntil ?? 0) > now;
            const idle = !awaitingHuman && now - record.lastUsedAt >= options.idleMs;
            const expired = record.expiresAt <= now;
            if (!idle && !expired)
                continue;
            try {
                if (record.releasing)
                    continue;
                record.releasing = true;
                await this.deps.releaseSteelSession(record.steelSessionId, record.principal);
                this.records.delete(record.handle);
                await this.releaseSessionSlot(record.principal, record.steelSessionId);
                if (record.mitigation.persistProfile && record.mitigation.profileId) {
                    await this.releaseProfileWriter(record.principal, record.mitigation.profileId, record.steelSessionId);
                }
                this.finalized(expired ? 'hard_expiry' : 'idle');
                reaped += 1;
            }
            catch (error) {
                record.releasing = false;
                // The record stays so the next sweep tries again. Dropping it here would leave the
                // browser running with nothing in this process aware that it exists.
                this.deps.onReapError?.(error);
            }
        }
        return reaped;
    }
    async releaseAll(path) {
        let released = 0;
        const errors = [];
        for (const record of [...this.records.values()]) {
            try {
                if (await this.release(record.handle, record.principal, path))
                    released += 1;
            }
            catch (error) {
                errors.push(error);
            }
        }
        if (errors.length)
            throw new AggregateError(errors, 'Some browser sessions could not be released during shutdown.');
        return released;
    }
    releaseCounts() {
        return { ...this.counts };
    }
}
//# sourceMappingURL=registry.js.map