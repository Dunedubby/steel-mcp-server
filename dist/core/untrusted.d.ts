/** Opening delimiter of the untrusted-content fence, without its attributes. */
export declare const UNTRUSTED_FENCE_OPEN_TAG = "<untrusted-page-content";
/** Closing delimiter of the untrusted-content fence. */
export declare const UNTRUSTED_FENCE_CLOSE = "</untrusted-page-content>";
/**
 * The standing instruction repeated inside every fence. The same sentence appears in the
 * server `instructions` string so a host sees it once up front and once per payload.
 */
export declare const UNTRUSTED_CONTENT_NOTICE: string;
/** Field attributes needed to decide whether a form control's value must never be serialised. */
export interface SensitiveFieldDescriptor {
    tagName: string;
    type?: string | undefined;
    name?: string | undefined;
    id?: string | undefined;
    autocomplete?: string | undefined;
}
/** Provenance recorded on every fenced payload so the model can see where the text came from. */
export interface Provenance {
    /** The URL after all redirects — never the URL that was requested. */
    finalUrl: string;
    /** ISO-8601 timestamp of the fetch. */
    fetchedAt: string;
}
/**
 * Provenance for fenced text that no single page fetch produced, so there is no final URL that
 * would be true of all of it — a whole-session diagnostics timeline being the case in hand.
 */
export interface SourceProvenance {
    /** What the text came from, in a form a reader can place, such as `steel-session:<id>`. */
    source: string;
    /** ISO-8601 timestamp of the fetch. */
    fetchedAt: string;
}
/** Removes characters that occupy no visual space, so hidden instructions cannot ride along. */
export declare function stripInvisible(text: string): string;
/** Removes HTML comments, including an unterminated trailing one. */
export declare function stripHtmlComments(html: string): string;
/** True when a form control's value must be redacted rather than serialised into a snapshot. */
export declare function isSensitiveField(field: SensitiveFieldDescriptor): boolean;
/** Replaces a secret with a placeholder that keeps the only useful signal: whether it is filled. */
export declare function redactSensitiveValue(value: string): string;
/**
 * Rewrites markdown links and images into inert text. Applied to accessibility-derived output,
 * where markdown syntax is never legitimate and a rendered image URL is an exfiltration channel.
 */
export declare function defangMarkdownLinks(text: string): string;
/**
 * Wraps page-derived text in the untrusted-content fence with its provenance header.
 *
 * The content is stripped of invisible characters and any literal closing delimiter is broken
 * up, so a page cannot terminate the fence early and have the rest read as server instructions.
 */
export declare function fenceUntrusted(content: string, provenance: Provenance | SourceProvenance): string;
