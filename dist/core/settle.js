const BASE_BUDGETS = {
    navigationWatchMs: 100,
    navigationMs: 3_000,
    mutationQuietMs: 100,
    mutationMaxMs: 3_000,
};
/**
 * Navigation kinds that do not load a new document and must not count as a navigation.
 *
 * `historyDifferentDocument` is deliberately absent: it does load a different document, which is
 * what a cross-document back or forward is, and the caller needs to wait for that load.
 */
const NON_LOADING_NAVIGATION_TYPES = new Set(['sameDocument', 'historySameDocument']);
/** Cross-document back and forward, which can be served from the back/forward cache. */
function isHistoryNavigation(navigationType) {
    return navigationType === 'historyDifferentDocument';
}
/**
 * Scales the base budgets by a network multiplier.
 *
 * Steel sessions reach the internet through Steel's fleet and often a proxy, so they are
 * systematically slower than the localhost browser these constants were tuned against.
 */
export function resolveSettleBudgets(multiplier) {
    if (!Number.isFinite(multiplier) || multiplier < 1) {
        throw new Error(`Settle multiplier must be at least 1, got ${multiplier}.`);
    }
    return {
        navigationWatchMs: BASE_BUDGETS.navigationWatchMs * multiplier,
        navigationMs: BASE_BUDGETS.navigationMs * multiplier,
        mutationQuietMs: BASE_BUDGETS.mutationQuietMs * multiplier,
        mutationMaxMs: BASE_BUDGETS.mutationMaxMs * multiplier,
    };
}
/**
 * Installs a page-lifetime mutation counter if one is not already there, and returns its value.
 *
 * The counter is stored on `window`, so a document load resets it to zero — which is correct:
 * a navigation is itself a change, and the caller already treats it as one.
 */
export async function readMutationCount(session) {
    const expression = `(() => {
    const state = window.__steelMutations || (window.__steelMutations = { count: 0 });
    if (!state.observer) {
        state.observer = new MutationObserver(records => { state.count += records.length; });
        state.observer.observe(document.documentElement, {
            childList: true, subtree: true, attributes: true, characterData: true,
        });
    }
    return state.count;
})()`;
    try {
        const result = await session.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
        });
        return result.result?.value ?? 0;
    }
    catch {
        // No reachable execution context yet; the caller only needs a baseline it can compare.
        return 0;
    }
}
function quiescenceExpression(quietMs, maxMs) {
    return `new Promise(resolve => {
    const target = document.body || document.documentElement;
    if (!target) { resolve(false); return; }
    let mutated = false;
    let quietTimer;
    const finish = () => { observer.disconnect(); clearTimeout(quietTimer); clearTimeout(capTimer); resolve(mutated); };
    const observer = new MutationObserver(() => {
        mutated = true;
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, ${quietMs});
    });
    observer.observe(target, { childList: true, subtree: true, attributes: true });
    quietTimer = setTimeout(finish, ${quietMs});
    const capTimer = setTimeout(finish, ${maxMs});
})`;
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function withDeadline(work, ms, onTimeout) {
    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve('timeout'), ms);
    });
    try {
        const outcome = await Promise.race([work, timeout]);
        return outcome === 'timeout' ? { value: onTimeout, timedOut: true } : { value: outcome, timedOut: false };
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Subscribes to the navigation events and returns a handle that finishes the settle pass.
 *
 * Subscribing has to happen before the action is dispatched. Some CDP commands —
 * `Page.navigateToHistoryEntry` among them — do not resolve until the navigation has already
 * committed, so a listener attached after the command returns never sees the event that command
 * caused, and the action reports that nothing happened.
 */
export function watchForSettle(session, options) {
    const { budgets, mainFrameId, targetFrameId } = options;
    let navigatedToUrl;
    let navigatedFrameId;
    let navigationType = '';
    let loadObserved = false;
    let commitObserved = false;
    let frameStoppedLoading = false;
    let onComplete;
    const completion = new Promise(resolve => {
        onComplete = resolve;
    });
    /** Whether a frame's navigation counts: the page's own, or the frame the target sits in. */
    const watched = (frameId) => !mainFrameId || frameId === mainFrameId || (targetFrameId !== undefined && frameId === targetFrameId);
    const settled = () => loadObserved || frameStoppedLoading || (commitObserved && isHistoryNavigation(navigationType));
    const offStarted = session.on('Page.frameStartedNavigating', (params) => {
        const type = String(params.navigationType ?? '');
        if (NON_LOADING_NAVIGATION_TYPES.has(type))
            return;
        if (!watched(params.frameId))
            return;
        if (navigatedToUrl !== undefined)
            return;
        navigatedToUrl = typeof params.url === 'string' ? params.url : undefined;
        navigatedFrameId = typeof params.frameId === 'string' ? params.frameId : undefined;
        navigationType = type;
        if (settled())
            onComplete?.();
    });
    const offLoad = session.on('Page.loadEventFired', () => {
        loadObserved = true;
        onComplete?.();
    });
    const offNavigated = session.on('Page.frameNavigated', (params) => {
        const frame = params.frame;
        if (!watched(frame?.id))
            return;
        commitObserved = true;
        // A back/forward-cache restore commits without ever firing a load event, so a history
        // navigation would otherwise burn the whole budget on every cross-document go_back.
        if (isHistoryNavigation(navigationType))
            onComplete?.();
    });
    const offStopped = session.on('Page.frameStoppedLoading', (params) => {
        if (navigatedFrameId === undefined || params.frameId !== navigatedFrameId)
            return;
        frameStoppedLoading = true;
        onComplete?.();
    });
    const dispose = () => {
        offStarted();
        offLoad();
        offNavigated();
        offStopped();
    };
    return {
        dispose,
        async finish() {
            let timedOut = false;
            try {
                await delay(budgets.navigationWatchMs);
                if (navigatedToUrl !== undefined && !settled()) {
                    const outcome = await withDeadline(completion, budgets.navigationMs, undefined);
                    timedOut ||= outcome.timedOut;
                }
            }
            finally {
                dispose();
            }
            let domMutated;
            try {
                const probe = session.send('Runtime.evaluate', {
                    expression: quiescenceExpression(budgets.mutationQuietMs, budgets.mutationMaxMs),
                    awaitPromise: true,
                    returnByValue: true,
                });
                const outcome = await withDeadline(probe, budgets.mutationMaxMs + budgets.mutationQuietMs, undefined);
                timedOut ||= outcome.timedOut;
                const observedDuringProbe = outcome.value?.result?.value ?? navigatedToUrl !== undefined;
                const counted = options.baselineMutations === undefined
                    ? false
                    : (await readMutationCount(session)) !== options.baselineMutations;
                domMutated = observedDuringProbe || counted;
            }
            catch {
                // The execution context is destroyed by a navigation mid-probe. That is itself
                // proof the DOM changed, so report a mutation rather than failing the action.
                domMutated = true;
            }
            const navigatedInFrame = navigatedToUrl !== undefined &&
                targetFrameId !== undefined &&
                navigatedFrameId === targetFrameId &&
                navigatedFrameId !== mainFrameId;
            return {
                navigated: navigatedToUrl !== undefined,
                navigatedToUrl,
                ...(navigatedInFrame ? { navigatedInFrame } : {}),
                domMutated,
                timedOut,
            };
        },
    };
}
/**
 * Subscribes and finishes in one call, for a caller with nothing to dispatch in between.
 *
 * The change signal matters as much as the wait: an action that produced no navigation, no
 * mutation and no focus change must be reported as such, because a tool that always says
 * "success" makes a model conclude the application is broken when input is silently dropped.
 */
export async function settle(session, options) {
    return watchForSettle(session, options).finish();
}
//# sourceMappingURL=settle.js.map