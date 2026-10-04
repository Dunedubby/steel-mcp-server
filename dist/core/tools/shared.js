import { z } from 'zod';
import { successResult } from '../envelope.js';
import { toolErrorResult } from '../errors.js';
import { DEFAULT_MAX_TOKENS, paginate } from '../pagination.js';
import { recordSpanFailure, resolveTracer, withToolCallSpan } from '../telemetry.js';
import { defangMarkdownLinks, fenceUntrusted, stripInvisible } from '../untrusted.js';
/** The `session_id` argument shared by every stateful tool. */
export const sessionIdSchema = z.string().describe('Live session_id from steel_session_create.');
export const maxTokensSchema = z
    .number()
    .int()
    .positive()
    .max(100_000)
    .optional()
    .describe(`Cap on the text returned, in tokens. Defaults to ${DEFAULT_MAX_TOKENS}.`);
/** Compact wire representation of a UUID while retaining strict runtime validation. */
export const uuidSchema = z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const cursorSchema = z
    .string()
    .optional()
    .describe('Cursor from a previous truncated response, to continue reading where it stopped.');
/**
 * Runs a handler inside its tool-call span and converts anything it throws into an error result.
 *
 * The span is the outermost layer so a failure is recorded as one before it becomes an ordinary
 * result. It records the error code only, and never touches the bytes the caller receives.
 */
export async function guard(deps, toolName, request, work) {
    return withToolCallSpan(resolveTracer(deps.tracer), {
        toolName,
        profile: deps.config.profile,
        deployment: deps.config.deployment,
        principal: deps.principal,
    }, request._meta, async (span) => {
        let finish;
        try {
            finish = deps.beginTool?.();
            return await work();
        }
        catch (error) {
            recordSpanFailure(span, error);
            return toolErrorResult(error);
        }
        finally {
            finish?.();
        }
    });
}
/**
 * Resolves a handle to its live page, re-authorising against this request's own principal.
 *
 * The check is deliberately repeated on every call and never cached from creation time: a
 * handle is an identifier, not a bearer capability, and a leaked one must not grant a stranger
 * a live, possibly logged-in browser.
 */
export async function withPage(deps, toolName, request, sessionId, work) {
    return guard(deps, toolName, request, async () => {
        const record = await deps.registry.resolveForAgent(sessionId, deps.principal);
        await deps.registry.touch(sessionId);
        const page = await deps.pool.page(record.steelSessionId, request.signal);
        return work(page, record);
    });
}
/** Wraps page-derived text in the provenance fence and applies the token budget with a cursor. */
export function fencedSection(body, provenance, options) {
    const page = paginate(body, options);
    const text = fenceUntrusted(page.text, provenance);
    return {
        text,
        pagination: page.truncated
            ? `Truncated at the token budget (about ${page.totalTokens} tokens in total). ` +
                `Call this tool again with cursor="${page.nextCursor}" to continue.`
            : undefined,
    };
}
/** Renders the fixed one-line page-state section shared by the stateful tools. */
export function pageStateLine(snapshot) {
    const missing = snapshot.unreadableFrames;
    // A form inside a frame that was not read is absent from the snapshot, and nothing else on the
    // page looks wrong, so the count is part of the page state rather than a footnote.
    const frames = missing === 0
        ? ''
        : ` — ${missing} frame${missing === 1 ? '' : 's'} could not be read, so anything inside is missing`;
    return fencedPageState(snapshot.url, snapshot.title, ` (snapshot ${snapshot.snapshotId})${frames}`);
}
export { successResult };
/** Page titles and URLs have the same provenance and trust level as the page body. */
export function fencedPageState(url, title, suffix = '') {
    const text = defangMarkdownLinks(stripInvisible(`${url}${title ? ` — ${title}` : ''}`)).slice(0, 4096);
    return fenceUntrusted(`${text}${suffix}`, { finalUrl: stripInvisible(url), fetchedAt: new Date().toISOString() });
}
//# sourceMappingURL=shared.js.map