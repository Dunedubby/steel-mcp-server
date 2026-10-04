import type { CallToolResult, InputRequiredResult, ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ServerDeps } from '../context.js';
import { type EnvelopeSections, successResult } from '../envelope.js';
import type { BrowserPage } from '../page.js';
import type { HandleRecord } from '../registry.js';
import type { PageSnapshot } from '../snapshot.js';
/** The `session_id` argument shared by every stateful tool. */
export declare const sessionIdSchema: z.ZodString;
export declare const maxTokensSchema: z.ZodOptional<z.ZodNumber>;
/** Compact wire representation of a UUID while retaining strict runtime validation. */
export declare const uuidSchema: z.ZodString;
export declare const cursorSchema: z.ZodOptional<z.ZodString>;
/**
 * What a tool handler needs from the request it is answering: cancellation, and the `_meta` the
 * caller's trace context arrives in. Taken from the SDK context so it cannot drift from it.
 */
export type ToolRequest = Pick<ServerContext['mcpReq'], 'signal' | '_meta'>;
/**
 * A tool outcome: an ordinary result, or the input_required result a human-in-the-loop handoff
 * returns when a person has to finish the step in the live browser.
 */
export type ToolOutcome = CallToolResult | InputRequiredResult;
/**
 * Runs a handler inside its tool-call span and converts anything it throws into an error result.
 *
 * The span is the outermost layer so a failure is recorded as one before it becomes an ordinary
 * result. It records the error code only, and never touches the bytes the caller receives.
 */
export declare function guard(deps: ServerDeps, toolName: string, request: ToolRequest, work: () => Promise<ToolOutcome>): Promise<ToolOutcome>;
/**
 * Resolves a handle to its live page, re-authorising against this request's own principal.
 *
 * The check is deliberately repeated on every call and never cached from creation time: a
 * handle is an identifier, not a bearer capability, and a leaked one must not grant a stranger
 * a live, possibly logged-in browser.
 */
export declare function withPage(deps: ServerDeps, toolName: string, request: ToolRequest, sessionId: string, work: (page: BrowserPage, record: HandleRecord) => Promise<ToolOutcome>): Promise<ToolOutcome>;
/** Wraps page-derived text in the provenance fence and applies the token budget with a cursor. */
export declare function fencedSection(body: string, provenance: {
    finalUrl: string;
    fetchedAt: string;
}, options: {
    maxTokens?: number | undefined;
    cursor?: string | undefined;
}): {
    text: string;
    pagination: string | undefined;
};
/** Renders the fixed one-line page-state section shared by the stateful tools. */
export declare function pageStateLine(snapshot: Pick<PageSnapshot, 'url' | 'title' | 'snapshotId' | 'unreadableFrames'>): string;
export type Sections = EnvelopeSections;
export { successResult };
/** Page titles and URLs have the same provenance and trust level as the page body. */
export declare function fencedPageState(url: string, title: string, suffix?: string): string;
