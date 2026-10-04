import { type ClientCapabilities, type InputRequiredResult, type RequestStateCodec, type ServerContext } from '@modelcontextprotocol/server';
import type { ServerDeps } from './context.js';
import { assessInteractiveBlock, type InteractiveBlockKind } from './errors.js';
import type { BrowserPage } from './page.js';
import type { HandleRecord } from './registry.js';
/** The key the elicitation is filed under, and the key the retry's response comes back on. */
export declare const HANDOFF_KEY = "steel_human_handoff";
/**
 * How many handoffs one session may ask for before it gives up and returns the actionable error.
 *
 * The spec permits asking indefinitely. A bound is better: after three attempts the person is not
 * getting through, and a caller stuck in a loop learns nothing from a fourth identical prompt.
 *
 * Counted per handle rather than per flow, and on the handle's own record rather than in this
 * process, so the number of times a session can interrupt a person depends on neither the client
 * returning anything nor which replica happens to serve the retry.
 */
export declare const MAX_HANDOFF_ROUNDS = 3;
/**
 * How long idle reclamation is suspended for while a person works.
 *
 * Matches the SDK's human-paced per-leg timeout, and the registry clamps it to the handle's own
 * hard expiry, so this can never keep a slot past the session's Steel-enforced lifetime.
 */
export { HANDOFF_GRACE_MS } from './lifecycle.js';
/**
 * The state a retried call carries.
 *
 * Signed, not encrypted: the client can read every field, so nothing secret goes in. Each field is
 * here to be checked on the way back in — the handle and tool so state minted for one session and
 * verb cannot be replayed onto another, the round so a cooperative client's loop is bounded too,
 * and the origin the dialog named.
 */
export interface HandoffState {
    handle: string;
    tool: string;
    block: InteractiveBlockKind | 'sensitive_input' | 'file_upload' | 'review' | 'manual_step';
    /** The origin the dialog named, which is all of the blocked page's URL a person was shown. */
    origin: string;
    round: number;
}
/**
 * Builds the HMAC codec for the handoff state.
 *
 * The binding is the spec's user-binding MUST: state minted for one principal on one method is
 * refused when echoed under another. The binding value is stored as a keyed tag, never raw, so the
 * principal does not travel in the value the client holds.
 */
export declare function createHandoffCodec(secret: string): RequestStateCodec<HandoffState>;
/**
 * Prepares the live-player URL for the one place it is allowed to go: the elicitation payload.
 *
 * The player URL is already an unauthenticated bearer capability — whoever holds it can watch and
 * drive the browser — so it must not also carry a credential. Only the player's own parameters
 * survive, the fragment is cleared, and a URL that is not http(s) or that carries userinfo is
 * refused rather than handed to a person to open.
 */
export declare function handoffViewerUrl(raw: string | undefined): string | undefined;
/**
 * Renders the blocked page's location for the dialog a person reads.
 *
 * Only the origin: a path and query are page-controlled prose, and the dialog opens a different
 * origin than the one it is describing, which is the whole setup for a phishing line in a window
 * a person trusts. `URL` punycodes the host, so what comes back is ASCII; it is invisible-stripped
 * anyway because this string is read by a person, not parsed.
 */
export declare function handoffOrigin(rawUrl: string): string | undefined;
/**
 * Whether this request may be answered with a URL-mode elicitation.
 *
 * The per-request `_meta` envelope is the 2026-07-28 capability view; `declaredAtConnect` supplies
 * the initialize-declared capabilities an older connection has instead. A bare `elicitation: {}`
 * means form mode on the 2025 reading, so the url sub-capability must be spelled out — the same
 * rule the SDK applies before it will put the request on the wire.
 */
export declare function supportsUrlElicitation(ctx: ServerContext, declaredAtConnect?: () => ClientCapabilities | undefined): boolean;
/**
 * Whether this request may be answered with a form elicitation.
 *
 * A bare `elicitation: {}` means form mode; an explicit URL-only declaration does not. The
 * inline-viewer handoff requires form mode. Read off the modern-wire per-request envelope only, since the inline
 * path it gates is itself modern-wire-only.
 */
export declare function supportsElicitation(ctx: ServerContext): boolean;
/**
 * Whether this request is being served to a client that has the inline session viewer rendered.
 *
 * The MCP-Apps UI extension is declared per request under `capabilities.extensions` on the
 * 2026-07-28 wire, and the inline viewer is a modern-wire feature, so — unlike elicitation — there
 * is no initialize-era fallback: a 2025-era connection carries no per-request capability envelope
 * and always degrades to the external player URL. The extension is the gate the whole inline path
 * keys off, because a client that renders the app is the one already on the same `session_id` the
 * viewer is showing.
 */
export declare function supportsInlineViewer(ctx: ServerContext): boolean;
export interface HandoffRequest {
    deps: ServerDeps;
    ctx: ServerContext;
    /** The initialize-declared capabilities, for a connection with no per-request envelope. */
    declaredAtConnect?: (() => ClientCapabilities | undefined) | undefined;
    /** The public handle the caller passed, sealed into the state so it cannot be replayed. */
    handle: string;
    record: HandleRecord;
    page: BrowserPage;
    /** The tool being served, sealed into the state and checked on the way back in. */
    tool: string;
}
/** A structural block assessment that does not start or mutate a handoff round. */
export interface InteractiveBlockInspection {
    verdict: ReturnType<typeof assessInteractiveBlock>;
    finalUrl: string;
}
/** Reuses the handoff classifier without eliciting, pinning, or exposing page evidence. */
export declare function inspectInteractiveBlock(page: BrowserPage): Promise<InteractiveBlockInspection>;
/**
 * Decides what a tool should do about a page only a person can get past.
 *
 * Returns `undefined` when the page is clear, which is also the verification result on a retry:
 * the live page is read again on every round, so the client's report that a person finished is
 * never what unblocks the call. Throws the actionable tool-execution error when a handoff cannot
 * or should not be offered — an unchanged fallback for every client that cannot elicit, and the
 * answer for a block with nothing a person could operate.
 */
export declare function resolveHumanHandoff(request: HandoffRequest): Promise<InputRequiredResult | undefined>;
