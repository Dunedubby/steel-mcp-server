// ABOUTME: The dependency bundle and registration surface every tool closes over, and the browser-pool
// ABOUTME: contract that keeps one attached CDP page per Steel session so refs survive across calls.
import { randomUUID } from 'node:crypto';
import { buildCdpUrl } from './config.js';
import { SteelToolError } from './errors.js';
import { BrowserPage } from './page.js';
import { resolveSettleBudgets } from './settle.js';
import { CdpConnection } from './steel/cdp.js';
import { resolveTracer, withCdpSpan } from './telemetry.js';
/** Mints the session UUID before the create call, closing the create-then-crash gap. */
export function mintSteelSessionId(deps) {
    return (deps.newSessionId ?? randomUUID)();
}
/** How many times `page` will evict a dead connection and reconnect before giving up. */
const MAX_RECONNECT_ATTEMPTS = 3;
/**
 * Opens one CDP connection per Steel session and keeps the attached page for later calls.
 *
 * The map holds the in-flight connect promise rather than the finished entry, so concurrent
 * callers share one connection instead of racing to open several — a loser's socket would leak
 * for the session's whole life, and ref state would split across two `PageState` instances.
 */
export class CdpSessionPool {
    config;
    settleMultiplier;
    connect;
    tracer;
    entries = new Map();
    constructor(config, settleMultiplier, connect = CdpConnection.connect, tracer = resolveTracer()) {
        this.config = config;
        this.settleMultiplier = settleMultiplier;
        this.connect = connect;
        this.tracer = tracer;
    }
    async open(steelSessionId, signal) {
        return withCdpSpan(this.tracer, 'connect', steelSessionId, () => this.openConnection(steelSessionId, signal));
    }
    async openConnection(steelSessionId, signal) {
        const connection = await this.connect(buildCdpUrl(this.config, steelSessionId), signal);
        try {
            const session = await connection.attachToPage();
            const page = await BrowserPage.attach(session, { budgets: resolveSettleBudgets(this.settleMultiplier) });
            return { connection, page };
        }
        catch (error) {
            // The socket is open but unusable; close it here or nothing ever will.
            await connection.close().catch(() => undefined);
            throw error;
        }
    }
    async page(steelSessionId, signal) {
        for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
            const existing = this.entries.get(steelSessionId);
            if (!existing) {
                // No await between the miss and the set, so two callers cannot both start a connect.
                const pending = this.open(steelSessionId, signal);
                this.entries.set(steelSessionId, pending);
                try {
                    return (await pending).page;
                }
                catch (error) {
                    // A failed connect must not be cached, or the session is unusable for good.
                    if (this.entries.get(steelSessionId) === pending)
                        this.entries.delete(steelSessionId);
                    throw error;
                }
            }
            const entry = await existing.catch(() => undefined);
            if (entry && !entry.connection.isClosed)
                return entry.page;
            // Only the caller that still sees this promise evicts it; the others re-read the map,
            // so a dropped socket costs one reconnect rather than one per waiting caller.
            if (this.entries.get(steelSessionId) === existing) {
                this.entries.delete(steelSessionId);
                await entry?.connection.close().catch(() => undefined);
            }
        }
        throw new SteelToolError('The browser connection for this session keeps dropping. Release the session with ' +
            'steel_session_release and create a new one.', { code: 'session_expired', details: { steelSessionId } });
    }
    async close(steelSessionId) {
        const pending = this.entries.get(steelSessionId);
        if (!pending)
            return;
        this.entries.delete(steelSessionId);
        // Awaiting the in-flight connect is what stops a socket that opens after this call leaking.
        const entry = await pending.catch(() => undefined);
        await entry?.connection.close().catch(() => undefined);
    }
    async closeAll() {
        await Promise.all([...this.entries.keys()].map(id => this.close(id)));
    }
}
//# sourceMappingURL=context.js.map