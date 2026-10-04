import type { CallToolResult } from '@modelcontextprotocol/server';
/** Stable machine-readable classification carried alongside every error message. */
export type SteelErrorCode = 'payment_required' | 'rate_limited' | 'unauthorized' | 'forbidden' | 'not_found' | 'proxy_failure' | 'bot_detection' | 'login_required' | 'stale_ref' | 'ref_not_found' | 'click_blocked' | 'client_capability_missing' | 'human_control_active' | 'self_host_unsupported' | 'session_expired' | 'session_releasing' | 'invalid_argument' | 'timeout' | 'steel_error';
export interface SteelToolErrorOptions {
    code: SteelErrorCode;
    /** Steel's own documentation link, relayed verbatim when the API supplies one. */
    linkToDocs?: string | undefined;
    /** Seconds the caller should wait before retrying, when the response said so. */
    retryAfterSeconds?: number | undefined;
    /** Extra fields surfaced in `structuredContent` for programmatic callers. */
    details?: Record<string, unknown> | undefined;
}
/** An error whose message is written for the model that has to recover from it. */
export declare class SteelToolError extends Error {
    readonly code: SteelErrorCode;
    readonly linkToDocs: string | undefined;
    readonly retryAfterSeconds: number | undefined;
    readonly details: Record<string, unknown> | undefined;
    constructor(message: string, options: SteelToolErrorOptions);
}
/** The Steel API's standardised error body. */
export interface SteelErrorBody {
    message?: string;
    error?: string;
    linkToDocs?: string;
}
/** Which part of the surface produced the failure, so rate limits can be named precisely. */
export type SteelOperation = 'session_create' | 'session_release' | 'browser_tool' | 'navigate' | 'cdp' | 'account';
export interface MapErrorContext {
    operation: SteelOperation;
    retryAfterSeconds?: number | undefined;
}
/** Maps a Steel HTTP failure to an error whose prose the calling model can act on. */
export declare function mapSteelHttpError(status: number, body: SteelErrorBody, context: MapErrorContext): SteelToolError;
/** Evidence available when deciding whether a response is an anti-bot interstitial. */
export interface BlockEvidence {
    status: number;
    headers?: Record<string, string> | undefined;
    body?: string | undefined;
    finalUrl?: string | undefined;
}
/** A recognised anti-bot vendor and the specific marker that identified it. */
export interface BotBlock {
    vendor: string;
    marker: string;
}
/** Recognises an anti-bot interstitial from status, headers, body markers or the final URL. */
export declare function detectBotBlock(evidence: BlockEvidence): BotBlock | null;
/** What the session already has enabled, so the ladder can name the next rung and only that one. */
export interface MitigationState {
    profileId?: string | undefined;
    paced?: boolean | undefined;
    useProxy?: boolean | undefined;
    solveCaptcha?: boolean | undefined;
    managedCredentials?: boolean | undefined;
    persistProfile?: boolean | undefined;
}
export type MitigationRung = 'identity' | 'pacing' | 'proxies' | 'captcha' | 'stealth';
export interface MitigationStep {
    rung: MitigationRung;
    advice: string;
}
/** Returns the single next rung on the mitigation ladder given what is already in use. */
export declare function nextMitigationRung(state: MitigationState): MitigationStep;
/** Builds the bot-detection error, naming the vendor and exactly one rung to try next. */
export declare function botDetectionError(block: BotBlock, url: string, state: MitigationState): SteelToolError;
/** What a live page revealed about being blocked, read from its snapshot rather than its headers. */
export interface PageBlockEvidence {
    /** The URL the page settled on, after redirects. */
    finalUrl: string;
    title?: string | undefined;
    /** The rendered accessibility text. Already invisible-stripped and password-redacted. */
    text?: string | undefined;
    /** True when the page holds a field the snapshot classified as sensitive, such as a password. */
    hasPasswordField?: boolean | undefined;
}
/** A block nobody but a person can clear: a challenge to solve, or a credential to enter. */
export type InteractiveBlockKind = 'captcha' | 'login_wall';
export interface InteractiveBlock {
    kind: InteractiveBlockKind;
    /** The vendor or mechanism recognised, always from this table and never from the page text. */
    vendor: string;
    marker: string;
}
/**
 * Recognises a page only a person can get past.
 *
 * The anti-bot verdict comes from `detectBotBlock`, so there is one vendor taxonomy rather than
 * two: a challenge page is the subset of anti-bot responses a person can clear by hand.
 */
export declare function detectInteractiveBlock(evidence: PageBlockEvidence): InteractiveBlock | null;
/** A control the page renders, as the snapshot pipeline classified it. */
export interface PageControl {
    role: string;
    name: string;
    /** True when the snapshot classified this control as a credential field, such as a password. */
    sensitive: boolean;
    /** True when the control is rendered inside the viewport. */
    visible: boolean;
    /** True when the control also takes pointer input — the snapshot gave it a `@eN` ref. */
    interactable: boolean;
}
/** Page evidence plus the controls on it, which is the part of a page its prose cannot fake. */
export interface HandoffBlockEvidence extends PageBlockEvidence {
    controls: readonly PageControl[];
}
/** A recognised block, and whether the evidence supports asking a person to clear it. */
export interface BlockVerdict {
    block: InteractiveBlock;
    /**
     * True when the page is an interstitial and holds the control a person would have to operate.
     *
     * Only this may open a live browser to a person. It is a higher bar than the block itself on
     * purpose: the player URL is an unauthenticated capability to watch and drive a possibly
     * signed-in browser, so page prose must never be the whole reason one is handed out.
     */
    clearableByPerson: boolean;
}
/**
 * Decides what a live page is, and whether a person could get past it.
 *
 * `null` means the page works: either nothing matched, or a marker matched prose on a page that is
 * plainly not a wall, such as a footer badge or an article about anti-bot vendors. A verdict with
 * `clearableByPerson: false` is a real block with nothing for a person to do — a blank interstitial
 * whose answer is the mitigation ladder, not a human.
 */
export declare function assessInteractiveBlock(evidence: HandoffBlockEvidence): BlockVerdict | null;
/** Builds the error for a login wall: name the identity options, never ask for a typed secret. */
export declare function loginWallError(url: string, state: MitigationState): SteelToolError;
/** The single tool-execution error for an interactive block, and the fallback when a client cannot elicit. */
export declare function interactiveBlockError(block: InteractiveBlock, url: string, state: MitigationState): SteelToolError;
export interface BatchBoundaryContext {
    completedSteps: number;
    nextStep: number | null;
    remainingSteps: number;
    clearableByPerson: boolean;
}
/** Stops a batch after a detected boundary without replaying already completed mutations. */
export declare function batchInteractiveBlockError(block: InteractiveBlock, url: string, state: MitigationState, context: BatchBoundaryContext): SteelToolError;
/**
 * Builds the error for a navigation Chrome refused.
 *
 * `errorText` on the `Page.navigate` result is the only signal CDP gives: the page still ends up
 * on Chrome's own error document, so ignoring it makes a DNS failure look like a successful load.
 */
export declare function navigationFailedError(url: string, errorText: string): SteelToolError;
/** Why a `@eN` reference no longer resolves. */
export type StaleRefReason = 'page_navigated' | 'frame_navigated' | 'node_removed' | 'role_or_name_changed' | 'snapshot_superseded';
export interface StaleRefContext {
    refSnapshotId: string;
    currentSnapshotId: string;
    reason: StaleRefReason;
}
/** Builds the precise staleness error: which ref, from which snapshot, why, and how to recover. */
export declare function staleRefError(ref: string, context: StaleRefContext): SteelToolError;
/** Builds the blocked-click error naming the element that intercepted the pointer. */
export declare function clickBlockedError(ref: string, coveringDescription: string, repeated?: boolean, episodeExhausted?: boolean): SteelToolError;
/** Builds the safe fallback when a moving page yields no hit-testable node after one layout refresh. */
export declare function clickHitTestUnstableError(ref: string, repeated?: boolean): SteelToolError;
/** Builds the hidden/collapsed-target error, with stronger guidance after the same node fails twice. */
export declare function clickLayoutUnavailableError(ref: string, repeated?: boolean): SteelToolError;
/** Builds the terminal error after Chrome dispatched the same click twice without observable progress. */
export declare function clickNoObservedChangeError(ref: string): SteelToolError;
/** Capabilities the self-hosted steel-browser image does not have. */
export type SelfHostCapability = 'concurrency' | 'use_proxy' | 'solve_captcha' | 'profile_id' | 'credentials' | 'files';
/** Builds the named capability error for a self-hosted deployment, never an opaque 400. */
export declare function selfHostUnsupportedError(capability: SelfHostCapability): SteelToolError;
/** Renders any throwable as an MCP tool-execution error result, never as a protocol error. */
export declare function toolErrorResult(error: unknown): CallToolResult;
