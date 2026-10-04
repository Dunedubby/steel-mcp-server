import { type Context, type Span, type SpanContext, type Tracer } from '@opentelemetry/api';
import type { ReleasePath } from './registry.js';
/** The instrumentation scope every span this server produces is recorded under. */
export declare const TRACER_NAME = "steel-mcp";
/**
 * Picks the tracer to use.
 *
 * Falling back to `trace.getTracer` is what makes tracing free and invisible by default: with no
 * provider registered the API hands back a no-op tracer whose spans never record, so nothing has to
 * be configured for the server to behave exactly as it did before.
 */
export declare function resolveTracer(tracer?: Tracer | undefined): Tracer;
export interface SessionReleaseSpanTarget {
    cause: ReleasePath;
    deployment: 'cloud' | 'self_hosted';
    registryBackend: 'memory' | 'redis';
}
/** Emits one low-cardinality internal lifecycle span with no session or caller identity. */
export declare function recordSessionReleased(tracer: Tracer, target: SessionReleaseSpanTarget): void;
/**
 * Reads a `traceparent` value into a span context, or nothing when it is unusable.
 *
 * The value comes from whoever called us, so every field is validated and an all-zero id — which
 * means "no parent" — is refused rather than turned into a span parented on nothing.
 */
export declare function parseTraceparent(raw: string): SpanContext | undefined;
/** Writes a span context as a version-00 `traceparent`, the only version this server emits. */
export declare function formatTraceparent(spanContext: SpanContext): string;
/**
 * Builds the parent context for a request from its `_meta`.
 *
 * The 2026-07-28 revision carries W3C trace context in the `traceparent`, `tracestate` and `baggage`
 * `_meta` keys. This reads them directly rather than through the global propagator, so a caller's
 * trace still stitches together whether or not the entrypoint registered one.
 */
export declare function contextFromRequestMeta(meta: Record<string, unknown> | undefined): Context;
/** The traceparent describing the span currently in flight, or nothing if none is. */
export declare function activeTraceparent(): string | undefined;
/**
 * Marks a span as failed.
 *
 * Only the error code is recorded, never the message and never an exception event: Steel error prose
 * quotes page titles, page text and final URLs, and none of that belongs in a telemetry backend.
 */
export declare function recordSpanFailure(span: Span, error: unknown): void;
/** What a tool-call span says about the call. No arguments, no page content, no credential. */
export interface ToolSpanTarget {
    toolName: string;
    profile: string;
    deployment: string;
    /** The one-way principal digest. The credential it came from must never reach a span. */
    principal: string;
}
/** Runs one tool call inside a span parented on the caller's trace context. */
export declare function withToolCallSpan<T>(tracer: Tracer, target: ToolSpanTarget, meta: Record<string, unknown> | undefined, work: (span: Span) => Promise<T>): Promise<T>;
/** What an outbound Steel REST call records. `path` never carries a query string. */
export interface SteelCallSpanTarget {
    method: string;
    path: string;
    host: string;
    operation: string;
}
/**
 * Runs one outbound Steel REST call inside a client span.
 *
 * The span is named after the operation rather than the path so the name stays low-cardinality when
 * the path holds a session id, and only the path is recorded — a full Steel URL can carry `apiKey`.
 */
export declare function withSteelCallSpan<T>(tracer: Tracer, target: SteelCallSpanTarget, work: () => Promise<T>): Promise<T>;
/**
 * Runs one CDP operation inside a client span.
 *
 * Connecting is the only CDP step that gets its own span. A span per command would drown a trace,
 * because `steel_wait_for` polls the page for as long as its timeout allows; the commands a tool
 * issues after connecting are covered by the tool-call span around them.
 */
export declare function withCdpSpan<T>(tracer: Tracer, operation: string, steelSessionId: string, work: () => Promise<T>): Promise<T>;
