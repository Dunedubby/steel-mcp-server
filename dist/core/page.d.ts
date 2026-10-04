import { type ChangeSignal } from './envelope.js';
import { type SettleBudgets } from './settle.js';
import { type CaptureOptions, type FindQuery, type PageSnapshot, PageState, type SnapshotNode } from './snapshot.js';
import type { CdpSession } from './steel/cdp.js';
/**
 * The interaction verbs, mirroring the shape of Steel's own computer-action union.
 *
 * The single source of truth: `steel_act`'s enum and `steel_batch`'s step validation both build
 * from this, so a verb can never be accepted by one and unknown to the other.
 */
export declare const ACTIONS: readonly ['click', 'type', 'fill_form', 'select', 'check', 'hover', 'scroll', 'press', 'go_back', 'dismiss_overlays'];
export type ActionName = (typeof ACTIONS)[number];
export interface FormField {
    target: string;
    value: string;
}
export interface ActRequest {
    action: ActionName;
    /** A `@eN` ref or a CSS selector. Agents guess selectors constantly; both are accepted. */
    target?: string | undefined;
    value?: string | undefined;
    fields?: FormField[] | undefined;
}
export interface ActOutcome {
    summary: string;
    change: ChangeSignal;
    changeDescription: string;
}
export interface NavigateOutcome {
    finalUrl: string;
    title: string;
    change: ChangeSignal;
    changeDescription: string;
}
export interface WaitRequest {
    text?: string | undefined;
    selector?: string | undefined;
    url?: string | undefined;
    timeoutMs?: number | undefined;
}
export interface WaitOutcome {
    satisfied: true;
    waitedMs: number;
    condition: string;
}
export interface AttachOptions {
    budgets: SettleBudgets;
}
/** Drives one attached page over CDP. Every method reports what changed, never a bare success. */
export declare class BrowserPage {
    private readonly session;
    private readonly state;
    private readonly budgets;
    private constructor();
    /** Enables the CDP domains the pipeline needs and nothing else. */
    static attach(session: CdpSession, options: AttachOptions): Promise<BrowserPage>;
    /** The main frame, learned on first use, so settle can ignore navigations in subframes. */
    private mainFrameId;
    /** Consecutive click failures for one live node, used to stop an agent retry loop. */
    private lastClickFailure;
    /** Related targets covered by the same node on one document share one bounded episode. */
    private clickFailureEpisode;
    private clickFailureLoaderId;
    /** The page state, exposed so a tool can resolve refs and read the last snapshot. */
    get pageState(): PageState;
    /**
     * Starts watching for change, and must be called before the action is dispatched.
     *
     * Both halves need to be in place first: a click handler that mutates synchronously finishes
     * before any observer installed afterwards could see it, and some navigation commands do not
     * resolve until the navigation they caused has already committed.
     */
    private beginChange;
    /** Whether the target's document is a child frame, whose DOM the settle pass does not observe. */
    private inChildFrame;
    private settleNow;
    private currentFrame;
    /** Reads release context without paying for a full accessibility and DOM snapshot. */
    pageSummary(): Promise<{
        url: string;
        title: string;
    }>;
    private readMainFrameId;
    navigate(url: string): Promise<NavigateOutcome>;
    private readTitle;
    /**
     * Captures the viewport as a JPEG.
     *
     * JPEG rather than PNG, and quality well below default, because the bytes travel through a
     * model's context window: an exact-pixel PNG costs several times more for no decision value.
     */
    captureScreenshot(options: {
        fullPage: boolean;
    }): Promise<{
        data: string;
    }>;
    snapshot(options: CaptureOptions): Promise<PageSnapshot>;
    find(query: FindQuery, options?: CaptureOptions): Promise<SnapshotNode[]>;
    /**
     * Reads the role and accessible name the element reports right now.
     *
     * One extra CDP call on the action path, and it is what makes the identity guard real: the
     * snapshot the model read is always at least one round trip old by the time a click lands.
     */
    private liveIdentity;
    /** Resolves a `@eN` ref or a CSS selector to a backend node id. */
    private resolveTarget;
    private requireTarget;
    /** Returns safe points inside the target's real content quad after scrolling it into view. */
    private candidatePoints;
    /** Returns the centre for actions such as hover that intentionally have one pointer position. */
    private centreOf;
    /**
     * Confirms the pointer would actually reach the target, and names the blocker if not.
     *
     * A click that lands on a cookie banner and reports success is the single most common
     * browsing dead-end; naming the covering element turns it into a self-correctable one.
     */
    private hitTestPoint;
    private clearClickFailures;
    /** Clears click recovery after a person is asked to change the page before an action is replayed. */
    resetClickRecovery(): void;
    private observeRecoveryLoader;
    /** Records one failure and reports exact-node repetition plus a shared-blocker episode bound. */
    private markClickFailure;
    /** Finds a verified clickable point, refreshing geometry once if the page moves under the hit test. */
    private reachablePoint;
    private clickAt;
    private pressKey;
    /**
     * Focuses a field, replaces whatever it already holds, and types the new value.
     *
     * Selecting the existing content through the Input domain rather than assigning `.value`
     * matters twice: it works for `contenteditable` as well as inputs, and it goes through the
     * real editing pipeline, so the `input` events a controlled component listens for actually
     * fire. Assigning the property directly leaves a framework's own state stale.
     */
    private typeInto;
    /**
     * Describes what was typed without repeating a secret back to the caller.
     *
     * Whether a field is sensitive is decided once, in the snapshot, where the input type and
     * autocomplete attributes are available. Re-deriving it from the visible label here would
     * either over-redact every field or miss the ones whose label says nothing useful. When the
     * snapshot has nothing to say about the target, the value is redacted rather than echoed.
     */
    private describeTyped;
    act(request: ActRequest): Promise<ActOutcome>;
    /** Confirms a button belongs to a rendered consent dialog/banner before automatic dismissal. */
    private isConsentControl;
    /** Presses Escape and clicks a recognised consent control, if one is on the page. */
    private dismissOverlays;
    /** Polls until an explicit condition holds. There is deliberately no network-idle wait. */
    waitFor(request: WaitRequest): Promise<WaitOutcome>;
    private conditionHolds;
}
