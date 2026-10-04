/** A CDP event payload. Shapes are protocol-defined; call sites narrow what they read. */
export type CdpEventParams = Record<string, unknown>;
/** A CDP connection scoped to one page target. All page operations depend on this, not on a socket. */
export interface CdpSession {
    send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    /** Subscribes to a CDP event; the returned function unsubscribes. */
    on(event: string, listener: (params: CdpEventParams) => void): () => void;
    close(): Promise<void>;
}
/** A browser-level CDP connection that can attach page-scoped sessions over the same socket. */
export declare class CdpConnection {
    private readonly socket;
    private readonly pending;
    private readonly listeners;
    private nextId;
    private closed;
    private constructor();
    /** True once the socket is gone, so a pool can evict this connection instead of reusing it. */
    get isClosed(): boolean;
    /**
     * Opens a CDP connection.
     *
     * The signal cancels the handshake only. It deliberately does not survive into the established
     * connection: the signal belongs to one tool call, while the connection is pooled for the whole
     * browser session, so honouring a later abort would brick the session handle for every
     * subsequent call while Steel kept billing for the browser.
     */
    static connect(url: string, signal?: AbortSignal): Promise<CdpConnection>;
    private receive;
    private failAll;
    /** Sends a CDP command, optionally targeting an attached page session. */
    send<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
    /** Subscribes to a CDP event across every session on this connection. */
    on(event: string, listener: (params: CdpEventParams, sessionId?: string) => void): () => void;
    /**
     * Attaches to the first page target and returns a session bound to it.
     *
     * Only one page is ever attached: eagerly attaching to every target is how a long-lived
     * browser connection exhausts memory on a site that opens many tabs.
     */
    attachToPage(): Promise<CdpSession>;
    close(): Promise<void>;
}
