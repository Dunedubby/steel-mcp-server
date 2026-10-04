import type { CdpSession } from './steel/cdp.js';
/** Time budgets for one settle pass, already scaled by the network multiplier. */
export interface SettleBudgets {
    /** How long to watch for a navigation to start before concluding none will. */
    navigationWatchMs: number;
    /** How long to wait for a started navigation to finish loading. */
    navigationMs: number;
    /** Quiet period with no DOM mutations that counts as settled. */
    mutationQuietMs: number;
    /** Hard cap on the quiescence wait, however busy the page is. */
    mutationMaxMs: number;
}
/** What the settle pass observed. This is the change signal every action tool returns. */
export interface SettleResult {
    navigated: boolean;
    navigatedToUrl: string | undefined;
    /** True when the navigation happened in the target's frame rather than in the page itself. */
    navigatedInFrame?: boolean | undefined;
    domMutated: boolean;
    /** True when a budget expired before the page went quiet. */
    timedOut: boolean;
}
export interface SettleOptions {
    budgets: SettleBudgets;
    /** When given, navigations in other frames are ignored so an iframe cannot look like a load. */
    mainFrameId?: string | undefined;
    /**
     * The frame holding the action's target, when that is not the main frame.
     *
     * A form inside an iframe submits by navigating its own frame, so that navigation counts as a
     * change too. A subframe never fires the page's load event, so the pass completes when the
     * frame reports that it stopped loading.
     */
    targetFrameId?: string | undefined;
    /**
     * The mutation counter read before the action, from {@link readMutationCount}.
     *
     * A click handler that mutates the DOM synchronously has finished long before an observer
     * installed afterwards could see it, so the quiescence probe alone reports "nothing changed"
     * on a click that plainly worked. The running counter closes that window.
     */
    baselineMutations?: number | undefined;
}
/**
 * Scales the base budgets by a network multiplier.
 *
 * Steel sessions reach the internet through Steel's fleet and often a proxy, so they are
 * systematically slower than the localhost browser these constants were tuned against.
 */
export declare function resolveSettleBudgets(multiplier: number): SettleBudgets;
/**
 * Installs a page-lifetime mutation counter if one is not already there, and returns its value.
 *
 * The counter is stored on `window`, so a document load resets it to zero — which is correct:
 * a navigation is itself a change, and the caller already treats it as one.
 */
export declare function readMutationCount(session: CdpSession): Promise<number>;
/** A settle pass that has already subscribed, so no event between now and `finish` is lost. */
export interface SettleWatch {
    dispose(): void;
    finish(): Promise<SettleResult>;
}
/**
 * Subscribes to the navigation events and returns a handle that finishes the settle pass.
 *
 * Subscribing has to happen before the action is dispatched. Some CDP commands —
 * `Page.navigateToHistoryEntry` among them — do not resolve until the navigation has already
 * committed, so a listener attached after the command returns never sees the event that command
 * caused, and the action reports that nothing happened.
 */
export declare function watchForSettle(session: CdpSession, options: SettleOptions): SettleWatch;
/**
 * Subscribes and finishes in one call, for a caller with nothing to dispatch in between.
 *
 * The change signal matters as much as the wait: an action that produced no navigation, no
 * mutation and no focus change must be reported as such, because a tool that always says
 * "success" makes a model conclude the application is broken when input is silently dropped.
 */
export declare function settle(session: CdpSession, options: SettleOptions): Promise<SettleResult>;
