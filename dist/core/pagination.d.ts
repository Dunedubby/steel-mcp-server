/** Claude Code's default cap on a single tool response. Every budget must stay well under it. */
export declare const HOST_RESPONSE_TOKEN_CAP = 25000;
/** Default per-tool budget, leaving room for the envelope and the host's own overhead. */
export declare const DEFAULT_MAX_TOKENS = 8000;
/** Rough token count. Deliberately cheap: exactness costs a tokenizer dependency and buys nothing. */
export declare function estimateTokens(text: string): number;
export interface PaginateOptions {
    maxTokens?: number | undefined;
    cursor?: string | undefined;
}
export interface Page {
    text: string;
    /** Present only when there is more to read. */
    nextCursor: string | undefined;
    truncated: boolean;
    /** Token estimate of the whole document, so the caller can say how much is left. */
    totalTokens: number;
}
/**
 * Returns one budgeted page of `text`, starting at `cursor`.
 *
 * Cuts at a line boundary so a snapshot line or a markdown row is never split mid-token, but
 * always makes progress: a single line longer than the whole budget is emitted on its own.
 */
export declare function paginate(text: string, options?: PaginateOptions): Page;
