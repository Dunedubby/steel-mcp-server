import type { AgentTrace, SessionLogEntry, SessionLogPayload } from './types.js';
/**
 * The URL an activity happened on.
 *
 * `page.url` is the documented page-context field and wins. A navigation activity carries only
 * `navigation.url` — live navigate activities have no `page` key at all — and a top-level `url` is
 * read last so an activity shaped in a way this server has not seen still resolves instead of
 * rendering a row with no page at all.
 */
export declare function agentTraceUrl(trace: AgentTrace): string | undefined;
/**
 * The readable text of an error activity.
 *
 * Steel documents an `error` field without pinning its shape, so a bare string and an object
 * carrying `message` both resolve and anything else is dropped rather than rendered as
 * `[object Object]`.
 */
export declare function agentTraceErrorText(trace: AgentTrace): string | undefined;
/**
 * What a change activity says about the text entered.
 *
 * Steel reports this as `{inputType, valueLength}` — a count and a kind, never the characters — so
 * it is safe to render and it answers the question someone debugging a form actually has. A `value`
 * in any other shape is dropped: the metadata object is the only shape known to be content-free,
 * and page input must not reach the transcript on the strength of a guess.
 */
export declare function agentTraceValueSummary(trace: AgentTrace): string | undefined;
/**
 * Whether a log entry earns a timeline row.
 *
 * A denylist rather than an allowlist on purpose: the noise is exactly the per-request pair, and a
 * type this server has not seen is likelier to be signal worth showing than more of the same noise,
 * so an unrecognised type is kept.
 */
export declare function isDiagnosticLog(entry: SessionLogEntry): boolean;
/**
 * Parses the JSON-encoded `log` string on an entry.
 *
 * Anything that is not JSON encoding an object yields `undefined`, so a payload Steel changes or
 * truncates costs one row its detail instead of throwing partway through rendering the timeline.
 */
export declare function parseSessionLogPayload(entry: SessionLogEntry): SessionLogPayload | undefined;
/** The URL a log entry concerns: where it navigated, or what failed to load. */
export declare function sessionLogUrl(payload: SessionLogPayload | undefined): string | undefined;
/** The failure message a log entry records, when it records one. */
export declare function sessionLogErrorText(payload: SessionLogPayload | undefined): string | undefined;
