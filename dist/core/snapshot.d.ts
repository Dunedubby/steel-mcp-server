import type { CdpSession } from './steel/cdp.js';
/** The computed styles the pipeline needs to decide whether a node can be targeted. */
export declare const COMPUTED_STYLES: readonly ['pointer-events', 'visibility', 'display', 'opacity', 'border-left-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'padding-left', 'padding-top', 'padding-right', 'padding-bottom'];
/** One node of a rendered snapshot. Only nodes with a `ref` can be targeted by an action. */
export interface SnapshotNode {
    /** `@eN`, present only on nodes that are visible and receive pointer events. */
    ref?: string | undefined;
    role: string;
    name: string;
    /** True when the name was synthesised because the element has no accessible name. */
    nameInferred: boolean;
    value?: string | undefined;
    backendNodeId: number;
    depth: number;
    inViewport: boolean;
    interactive: boolean;
    /** True for a form control whose value must never be echoed back, such as a password input. */
    sensitive: boolean;
    properties?: Record<string, string | number | boolean> | undefined;
    /** Element centre in CSS pixels, used to dispatch pointer events. */
    center?: {
        x: number;
        y: number;
    } | undefined;
}
/** A captured page snapshot, versioned so a stale ref can be diagnosed precisely. */
export interface PageSnapshot {
    snapshotId: string;
    loaderId: string;
    url: string;
    title: string;
    nodes: SnapshotNode[];
    text: string;
    /** Nodes omitted from `text` because the budget ran out; paginate with a cursor. */
    truncated: boolean;
    /** Frames whose tree could not be read, so their controls are missing from `nodes`. */
    unreadableFrames: number;
}
export interface CaptureOptions {
    /** Elide purely structural containers, keeping targetable and text-bearing nodes. Default true. */
    interactiveOnly?: boolean | undefined;
    /** Maximum tree depth to render. */
    maxDepth?: number | undefined;
    /** Cap on rendered nodes, so a huge page cannot blow the host's response budget. */
    maxNodes?: number | undefined;
}
/** What a `@eN` ref points at, plus the identity recorded when the ref was issued. */
export interface ResolvedRef {
    ref: string;
    backendNodeId: number;
    /** The loader of the top document when the ref was issued. */
    loaderId: string;
    /** The frame whose document holds the node. */
    frameId: string;
    /** The loader of that frame's document, when the frame tree reported the frame. */
    frameLoaderId?: string | undefined;
    role: string;
    name: string;
    snapshotId: string;
    center?: {
        x: number;
        y: number;
    } | undefined;
}
/**
 * Decides whether an element's identity moved since the snapshot the caller read.
 *
 * Deliberately strict. Distinguishing a cosmetic relabel (`Save` to `Saving…`) from a swapped
 * action (`Save` to `Delete everything`) needs a similarity threshold, and a threshold that guesses
 * wrong clicks the wrong button. So any role or name change counts, and the caller re-reads the
 * page and retries — one extra round trip, against the alternative of a destructive misclick.
 *
 * The one exception is a name appearing or disappearing: Chrome frequently computes an accessible
 * name a beat after layout, and an empty name on either side is no evidence of a different element.
 */
export declare function identityChanged(recorded: Pick<ResolvedRef, 'role' | 'name'>, live: Pick<ResolvedRef, 'role' | 'name'>): boolean;
/** Renders snapshot nodes as an indented tree, one line per node. */
export declare function renderSnapshot(nodes: SnapshotNode[]): string;
export interface FindQuery {
    text?: string | undefined;
    regex?: string | undefined;
    role?: string | undefined;
    interactiveOnly?: boolean | undefined;
}
/** Filters snapshot nodes by name, role or pattern — far cheaper than re-reading a whole page. */
export declare function findInSnapshot(nodes: SnapshotNode[], query: FindQuery): SnapshotNode[];
/**
 * Per-session page state: the ref registry and the latest snapshot.
 *
 * Refs are keyed on `(loaderId, backendNodeId)` so a node that survives a DOM mutation keeps its
 * ref even when its role or accessible name changes — a button whose label flips `Save` to
 * `Saving…` must not silently become a different element mid-flow. The ref counter never resets,
 * so a ref issued before a document load can never be reused for a different node afterwards.
 */
export declare class PageState {
    private readonly refByNode;
    private readonly recordByRef;
    private refCounter;
    private snapshotCounter;
    private currentLoaderId;
    /** Each frame's current loader, so a ref into a frame that reloaded is caught as stale. */
    private frameLoaders;
    private latest;
    /** The most recent snapshot, or undefined if the page has never been read. */
    get lastSnapshot(): PageSnapshot | undefined;
    capture(session: CdpSession, options: CaptureOptions): Promise<PageSnapshot>;
    /** Resolves a `@eN` ref, throwing a precise error naming why it no longer works. */
    resolveRef(ref: string): ResolvedRef;
    /**
     * Verifies that a target still has the role and accessible name the snapshot recorded.
     *
     * Acting on an element relabelled from `Save` to `Delete everything` between the read and the
     * click is the failure mode this prevents. A cosmetic relabel is not: a button that goes from
     * `Save` to `Saving…` is the same button, and refusing to click it would trade a real bug for
     * a worse one. So a role change always counts, and a name change counts only when neither name
     * contains the other.
     */
    assertIdentityUnchanged(ref: string, live: Pick<ResolvedRef, 'role' | 'name'>): void;
}
