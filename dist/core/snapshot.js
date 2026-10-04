// ABOUTME: The accessibility snapshot pipeline: joins the AX tree with DOMSnapshot geometry, assigns
// ABOUTME: @eN refs keyed on (loaderId, backendNodeId) and renders a budgeted, redacted page tree.
import safeRegex from 'safe-regex2';
import { SteelToolError, staleRefError } from './errors.js';
import { defangMarkdownLinks, isSensitiveField, redactSensitiveValue, stripInvisible } from './untrusted.js';
/** The computed styles the pipeline needs to decide whether a node can be targeted. */
export const COMPUTED_STYLES = [
    'pointer-events',
    'visibility',
    'display',
    'opacity',
    // An iframe's viewport is its element box less its border and padding, so placing a child
    // frame's nodes in the page, and knowing how much of that frame is on screen, needs all eight.
    'border-left-width',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'padding-left',
    'padding-top',
    'padding-right',
    'padding-bottom',
];
/** Reads every frame's current loader out of a `Page.getFrameTree` answer. */
function readFrameLoaders(tree) {
    const loaders = new Map();
    const walk = (node) => {
        if (!node)
            return;
        if (node.frame?.id && node.frame.loaderId)
            loaders.set(node.frame.id, node.frame.loaderId);
        for (const child of node.childFrames ?? [])
            walk(child);
    };
    walk(tree);
    return loaders;
}
/** Roles whose text is worth keeping even when the caller asked for interactive nodes only. */
const TEXT_BEARING_ROLES = new Set([
    'RootWebArea',
    'heading',
    'paragraph',
    'StaticText',
    'text',
    'alert',
    'status',
    'article',
    'list',
    'listitem',
    'table',
    'row',
    'cell',
    'columnheader',
    'rowheader',
    'dialog',
    'alertdialog',
]);
/** Roles that describe the document or a text run rather than something a model can act on. */
const NEVER_TARGETABLE_ROLES = new Set([
    'RootWebArea',
    'WebArea',
    'InlineTextBox',
    'StaticText',
    'none',
    'presentation',
]);
/**
 * Roles dropped from the tree entirely.
 *
 * `InlineTextBox` is Chrome's per-line breakdown of a `StaticText`; it repeats the same words with
 * no DOM node behind it, which both doubles the token cost and makes every line look off-screen.
 */
const DROPPED_ROLES = new Set(['InlineTextBox']);
/** AX properties worth surfacing; everything else is noise in a context window. */
const USEFUL_PROPERTIES = new Set([
    'level',
    'checked',
    'selected',
    'expanded',
    'disabled',
    'required',
    'invalid',
    'pressed',
    'readonly',
]);
const DEFAULT_MAX_NODES = 1_500;
/**
 * How many of a page's frames are read.
 *
 * Every frame costs a round trip and a full accessibility tree buffered in memory, and the page
 * chooses how many frames it has: a hostile one can open hundreds. Real pages sit far below this.
 */
const MAX_FRAMES_READ = 24;
function asString(value) {
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}
/** Reads the DOMSnapshot payload into one entry per frame document, in the order Chrome sent them. */
function readDomDocuments(payload) {
    const snapshot = payload;
    const strings = snapshot.strings ?? [];
    const text = (index) => index === undefined || index < 0 ? '' : (strings[index] ?? '');
    const documents = (snapshot.documents ?? []).map(document => {
        const nodes = document.nodes ?? {};
        const backendIds = nodes.backendNodeId ?? [];
        const inputValues = new Map();
        const inputIndex = nodes.inputValue?.index ?? [];
        const inputValue = nodes.inputValue?.value ?? [];
        inputIndex.forEach((nodeIndex, at) => {
            inputValues.set(nodeIndex, text(inputValue[at]));
        });
        const clickable = new Set(nodes.isClickable?.index ?? []);
        const layoutByNode = new Map();
        const layoutNodeIndex = document.layout?.nodeIndex ?? [];
        layoutNodeIndex.forEach((nodeIndex, at) => {
            layoutByNode.set(nodeIndex, {
                styles: document.layout?.styles?.[at] ?? [],
                bounds: document.layout?.bounds?.[at] ?? [],
            });
        });
        const facts = new Map();
        backendIds.forEach((backendNodeId, nodeIndex) => {
            const attributePairs = nodes.attributes?.[nodeIndex] ?? [];
            const attributes = {};
            for (let i = 0; i + 1 < attributePairs.length; i += 2) {
                attributes[text(attributePairs[i]).toLowerCase()] = text(attributePairs[i + 1]);
            }
            const layout = layoutByNode.get(nodeIndex);
            const styles = {};
            COMPUTED_STYLES.forEach((name, at) => {
                styles[name] = text(layout?.styles?.[at]);
            });
            const bounds = layout?.bounds;
            facts.set(backendNodeId, {
                tagName: text(nodes.nodeName?.[nodeIndex]),
                attributes,
                inputValue: inputValues.get(nodeIndex),
                bounds: bounds && bounds.length >= 4
                    ? [bounds[0] ?? 0, bounds[1] ?? 0, bounds[2] ?? 0, bounds[3] ?? 0]
                    : undefined,
                styles,
                clickable: clickable.has(nodeIndex),
            });
        });
        return {
            frameId: text(document.frameId),
            facts,
            scroll: { x: document.scrollOffsetX ?? 0, y: document.scrollOffsetY ?? 0 },
            childFrameByOwner: new Map(),
        };
    });
    // Chrome names the document each `<iframe>` holds by its index in this same list, which is the
    // whole frame tree without a second round trip for it.
    (snapshot.documents ?? []).forEach((document, at) => {
        const link = document.nodes?.contentDocumentIndex;
        const owners = link?.index ?? [];
        const held = link?.value ?? [];
        owners.forEach((nodeIndex, k) => {
            const parent = documents[at];
            const child = documents[held[k] ?? -1];
            const backendNodeId = document.nodes?.backendNodeId?.[nodeIndex];
            if (!parent || !child || backendNodeId === undefined)
                return;
            parent.childFrameByOwner.set(backendNodeId, child.frameId);
            child.owner = { backendNodeId, parentFrameId: parent.frameId };
        });
    });
    return documents;
}
function pixels(value) {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) ? parsed : 0;
}
function intersect(a, b) {
    if (!a)
        return b;
    return {
        left: Math.max(a.left, b.left),
        top: Math.max(a.top, b.top),
        right: Math.min(a.right, b.right),
        bottom: Math.min(a.bottom, b.bottom),
    };
}
function overlaps(a, b) {
    return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}
/** Stands in for the top document, which no frame box clips. */
const EVERYWHERE = {
    left: Number.NEGATIVE_INFINITY,
    top: Number.NEGATIVE_INFINITY,
    right: Number.POSITIVE_INFINITY,
    bottom: Number.POSITIVE_INFINITY,
};
/** Places every frame's document in the top document, so all their nodes share one space. */
function resolveFramePlacements(documents) {
    const byFrame = new Map(documents.map(document => [document.frameId, document]));
    const placements = new Map();
    const walking = new Set();
    const placementOf = (document) => {
        const known = placements.get(document.frameId);
        if (known)
            return known;
        // Two documents sharing a frame id would make the walk up the tree loop. Chrome does not
        // emit one, but the ids arrive from a page's own browser, so the walk stays total.
        if (walking.has(document.frameId))
            return { origin: { x: 0, y: 0 } };
        walking.add(document.frameId);
        const parent = document.owner ? byFrame.get(document.owner.parentFrameId) : undefined;
        let placement = { origin: { x: 0, y: 0 } };
        if (document.owner && parent) {
            const ownerFacts = parent.facts.get(document.owner.backendNodeId);
            const [ownerX = 0, ownerY = 0, ownerWidth = 0, ownerHeight = 0] = ownerFacts?.bounds ?? [];
            const above = placementOf(parent);
            // Bounds are unscrolled document coordinates, so the frame's top-left corner is the
            // owning element's content-box corner, and the document behind it is offset further by
            // however far the frame is scrolled. See NOTES.md §10.
            const corner = {
                x: above.origin.x +
                    ownerX +
                    pixels(ownerFacts?.styles['border-left-width']) +
                    pixels(ownerFacts?.styles['padding-left']),
                y: above.origin.y +
                    ownerY +
                    pixels(ownerFacts?.styles['border-top-width']) +
                    pixels(ownerFacts?.styles['padding-top']),
            };
            // The element's bounds are its border box, so its viewport is that box less the border
            // and padding on all four sides. Chrome's default iframe border is 2px, so taking the
            // border box whole is wrong on every page, not just styled ones.
            const insetX = pixels(ownerFacts?.styles['border-left-width']) +
                pixels(ownerFacts?.styles['padding-left']) +
                pixels(ownerFacts?.styles['border-right-width']) +
                pixels(ownerFacts?.styles['padding-right']);
            const insetY = pixels(ownerFacts?.styles['border-top-width']) +
                pixels(ownerFacts?.styles['padding-top']) +
                pixels(ownerFacts?.styles['border-bottom-width']) +
                pixels(ownerFacts?.styles['padding-bottom']);
            placement = {
                origin: { x: corner.x - document.scroll.x, y: corner.y - document.scroll.y },
                // A frame shows only what fits in its own viewport, so a node further down the frame
                // is out of sight even when that page position falls inside the browser viewport.
                visible: intersect(above.visible, {
                    left: corner.x,
                    top: corner.y,
                    right: corner.x + Math.max(0, ownerWidth - insetX),
                    bottom: corner.y + Math.max(0, ownerHeight - insetY),
                }),
            };
        }
        placements.set(document.frameId, placement);
        return placement;
    };
    for (const document of documents)
        placementOf(document);
    return placements;
}
/** Flattens every frame's facts into one table, with child-frame bounds moved into page space. */
function mergeDomFacts(documents, placements) {
    const merged = new Map();
    for (const document of documents) {
        const origin = placements.get(document.frameId)?.origin ?? { x: 0, y: 0 };
        for (const [backendNodeId, facts] of document.facts) {
            const bounds = facts.bounds;
            merged.set(backendNodeId, bounds === undefined
                ? facts
                : { ...facts, bounds: [bounds[0] + origin.x, bounds[1] + origin.y, bounds[2], bounds[3]] });
        }
    }
    return merged;
}
/** Roles a model can meaningfully act on. Structural containers never earn a ref. */
const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'textbox',
    'searchbox',
    'checkbox',
    'radio',
    'combobox',
    'listbox',
    'option',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'treeitem',
    'textarea',
    'ComboBox',
    'PopUpButton',
]);
/** Whether a frame is worth reading: laid out, not hidden, and not painted away. */
function isVisibleFrame(facts) {
    return isRendered(facts) && pixels(facts.styles.opacity || '1') > 0;
}
/** Whether the layout engine gave the element a box with area. */
function hasBox(facts) {
    if (!facts?.bounds)
        return false;
    const [, , width, height] = facts.bounds;
    return width > 0 && height > 0;
}
/** Whether the layout engine gave the element a visible box of its own. */
function isRendered(facts) {
    return hasBox(facts) && facts.styles.visibility !== 'hidden' && facts.styles.visibility !== 'collapse';
}
/**
 * Whether a failed per-frame read means the frame itself is gone.
 *
 * That is the one failure that is a fact about the page: the frame detached between the DOM
 * snapshot and this read. Anything else is about the session, and must not be filed as a frame.
 */
function isFrameGoneError(error) {
    return error instanceof Error && /frame\b.*\bnot found|no frame\b/i.test(error.message);
}
/**
 * Decides whether a node may be targeted: it must be rendered, visible, accept pointer events,
 * and be something a person could actually interact with. A container that merely happens to be
 * visible gets no ref, so the model structurally cannot aim an action at the page background.
 */
function isTargetable(facts, role, focusable) {
    if (!isRendered(facts))
        return false;
    if (facts.styles['pointer-events'] === 'none')
        return false;
    if (NEVER_TARGETABLE_ROLES.has(role))
        return false;
    return facts.clickable || focusable || INTERACTIVE_ROLES.has(role);
}
/**
 * Synthesises a name for a node Chrome could not name.
 *
 * A third to a half of buttons and links in the wild have no accessible name, so refusing to
 * name them would make those elements invisible to the model. The guess is flagged so the
 * model can discount it.
 */
function synthesizeName(facts) {
    if (!facts)
        return '';
    const candidates = [
        facts.attributes['aria-label'],
        facts.attributes.title,
        facts.attributes.alt,
        facts.attributes.placeholder,
        facts.attributes.value,
        facts.attributes.name,
    ];
    return candidates.find(candidate => candidate && candidate.trim().length > 0)?.trim() ?? '';
}
function cleanText(value) {
    return defangMarkdownLinks(stripInvisible(value)).replace(/\s+/g, ' ').trim();
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
export function identityChanged(recorded, live) {
    if (recorded.role !== live.role)
        return true;
    const before = recorded.name.trim().toLowerCase();
    const after = live.name.trim().toLowerCase();
    if (before === after)
        return false;
    return before !== '' && after !== '';
}
/** Renders snapshot nodes as an indented tree, one line per node. */
export function renderSnapshot(nodes) {
    return nodes
        .map(node => {
        const indent = '  '.repeat(node.depth);
        const parts = [`- ${node.role}`];
        if (node.name)
            parts.push(`"${node.name}"`);
        if (node.nameInferred && node.name)
            parts.push('(inferred)');
        if (node.ref)
            parts.push(node.ref);
        if (node.value !== undefined)
            parts.push(`[value=${JSON.stringify(node.value)}]`);
        for (const [key, value] of Object.entries(node.properties ?? {}))
            parts.push(`[${key}=${value}]`);
        if (!node.inViewport)
            parts.push('[off-screen]');
        return indent + parts.join(' ');
    })
        .join('\n');
}
/** Filters snapshot nodes by name, role or pattern — far cheaper than re-reading a whole page. */
export function findInSnapshot(nodes, query) {
    let matcher;
    if (query.regex !== undefined) {
        let pattern;
        try {
            pattern = new RegExp(query.regex, 'i');
        }
        catch (error) {
            throw new SteelToolError(`"${query.regex}" is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}. ` +
                'Use the text argument for a plain substring search.', { code: 'invalid_argument' });
        }
        if (!safeRegex(pattern, { limit: 25 })) {
            throw new SteelToolError('That regular expression may take too long to evaluate. Use a simpler pattern or the text argument.', { code: 'invalid_argument' });
        }
        matcher = node => pattern.test(node.name);
    }
    else if (query.text !== undefined) {
        const needle = query.text.toLowerCase();
        matcher = node => node.name.toLowerCase().includes(needle);
    }
    else {
        matcher = () => true;
    }
    const matches = nodes.filter(node => {
        if (query.role && node.role !== query.role)
            return false;
        if (query.interactiveOnly && !node.ref)
            return false;
        return matcher(node);
    });
    // A label and the field it labels usually share a name. The field is the one a caller can act
    // on, so targetable matches lead; document order is preserved within each group.
    return [...matches.filter(node => node.ref !== undefined), ...matches.filter(node => node.ref === undefined)];
}
/**
 * Per-session page state: the ref registry and the latest snapshot.
 *
 * Refs are keyed on `(loaderId, backendNodeId)` so a node that survives a DOM mutation keeps its
 * ref even when its role or accessible name changes — a button whose label flips `Save` to
 * `Saving…` must not silently become a different element mid-flow. The ref counter never resets,
 * so a ref issued before a document load can never be reused for a different node afterwards.
 */
export class PageState {
    refByNode = new Map();
    recordByRef = new Map();
    refCounter = 0;
    snapshotCounter = 0;
    currentLoaderId = '';
    /** Each frame's current loader, so a ref into a frame that reloaded is caught as stale. */
    frameLoaders = new Map();
    latest;
    /** The most recent snapshot, or undefined if the page has never been read. */
    get lastSnapshot() {
        return this.latest;
    }
    async capture(session, options) {
        const [frameTree, axTree, domSnapshot, metrics] = await Promise.all([
            session.send('Page.getFrameTree'),
            session.send('Accessibility.getFullAXTree'),
            session.send('DOMSnapshot.captureSnapshot', {
                computedStyles: [...COMPUTED_STYLES],
                includeDOMRects: true,
            }),
            session.send('Page.getLayoutMetrics'),
        ]);
        const loaderId = frameTree.frameTree?.frame?.loaderId ?? '';
        const url = frameTree.frameTree?.frame?.url ?? '';
        if (loaderId !== this.currentLoaderId) {
            // A new document invalidates every node identity. The counter deliberately keeps
            // climbing so an old ref resolves to a stale-ref error, never to a different node.
            this.refByNode.clear();
            this.currentLoaderId = loaderId;
        }
        const frameLoaders = readFrameLoaders(frameTree.frameTree);
        this.frameLoaders = frameLoaders;
        const documents = readDomDocuments(domSnapshot);
        const placements = resolveFramePlacements(documents);
        const facts = mergeDomFacts(documents, placements);
        const frameByOwner = new Map();
        for (const document of documents) {
            for (const [owner, childFrameId] of document.childFrameByOwner)
                frameByOwner.set(owner, childFrameId);
        }
        const viewport = metrics.cssLayoutViewport ?? {};
        const viewportTop = viewport.pageY ?? 0;
        const viewportLeft = viewport.pageX ?? 0;
        const viewportBottom = viewportTop + (viewport.clientHeight ?? 0);
        const viewportRight = viewportLeft + (viewport.clientWidth ?? 0);
        this.snapshotCounter += 1;
        const snapshotId = `s${this.snapshotCounter}`;
        // getFullAXTree answers for one frame and stops at its iframes, so a control inside a frame
        // is only reachable if that frame is asked for by name.
        const topDocument = documents.find(document => document.owner === undefined);
        const ownerOf = (document) => facts.get(document.owner?.backendNodeId ?? -1);
        const childFrames = documents.filter(document => document !== topDocument);
        // A frame its owner never laid out, or painted away, shows nothing a person could act on,
        // and reading it would spend a round trip and part of the node budget on a tracking pixel
        // or an invisible overlay.
        const readable = childFrames.filter(document => isVisibleFrame(ownerOf(document)));
        // A frame with a box that is hidden or at zero opacity is often a form engine mid fade-in,
        // so its absence is said out loud. A frame with no box shows nothing whatever happens next.
        const paintedAway = childFrames.filter(document => hasBox(ownerOf(document)) && !isVisibleFrame(ownerOf(document)));
        const childDocuments = readable.slice(0, MAX_FRAMES_READ);
        let unreadableFrames = readable.length - childDocuments.length + paintedAway.length;
        const axByFrame = new Map([[topDocument?.frameId ?? '', axTree.nodes ?? []]]);
        const childTrees = await Promise.all(childDocuments.map(document => session.send('Accessibility.getFullAXTree', { frameId: document.frameId }).then(tree => ({ document, frameNodes: tree.nodes ?? [] }), (error) => {
            // A frame that went away between the DOM snapshot and this call is a fact
            // about the page, and the rest of the page is worth returning. Any other
            // failure is about the session, and a partial snapshot would hide it.
            if (!isFrameGoneError(error))
                throw error;
            return { document, frameNodes: undefined };
        })));
        for (const { document, frameNodes } of childTrees) {
            if (frameNodes === undefined)
                unreadableFrames += 1;
            else
                axByFrame.set(document.frameId, frameNodes);
        }
        // Node ids are only unique within one frame's tree, so every lookup is keyed on both.
        const axKey = (frameId, nodeId) => `${frameId}\0${nodeId}`;
        const byId = new Map();
        for (const [frameId, frameNodes] of axByFrame) {
            for (const node of frameNodes)
                byId.set(axKey(frameId, node.nodeId), node);
        }
        const rootsOf = (frameId) => (axByFrame.get(frameId) ?? []).filter(node => node.parentId === undefined || !byId.has(axKey(frameId, node.parentId)));
        const nodes = [];
        const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
        let truncated = false;
        const visit = (axNode, frameId, depth, parentName) => {
            if (nodes.length >= maxNodes) {
                truncated = true;
                return;
            }
            if (options.maxDepth !== undefined && depth > options.maxDepth)
                return;
            const children = (axNode.childIds ?? [])
                .map(id => byId.get(axKey(frameId, id)))
                .filter((n) => n !== undefined);
            if (axNode.ignored) {
                // Ignored nodes contribute nothing, but their subtree can still be meaningful — and
                // for an iframe that subtree is a whole document, reached through the frame rather
                // than through childIds.
                for (const child of children)
                    visit(child, frameId, depth, parentName);
                const held = axNode.backendDOMNodeId === undefined ? undefined : frameByOwner.get(axNode.backendDOMNodeId);
                if (held !== undefined)
                    for (const root of rootsOf(held))
                        visit(root, held, depth, parentName);
                return;
            }
            const role = asString(axNode.role?.value) || 'generic';
            if (DROPPED_ROLES.has(role))
                return;
            const backendNodeId = axNode.backendDOMNodeId;
            const nodeFacts = backendNodeId === undefined ? undefined : facts.get(backendNodeId);
            const accessibleName = cleanText(asString(axNode.name?.value));
            const inferredName = accessibleName ? '' : cleanText(synthesizeName(nodeFacts));
            const name = accessibleName || inferredName;
            const focusable = axNode.properties?.some(property => property.name === 'focusable' && property.value?.value === true) ??
                false;
            const targetable = backendNodeId !== undefined && isTargetable(nodeFacts, role, focusable);
            const bounds = nodeFacts?.bounds;
            const center = bounds ? { x: bounds[0] + bounds[2] / 2, y: bounds[1] + bounds[3] / 2 } : undefined;
            const box = bounds
                ? { left: bounds[0], top: bounds[1], right: bounds[0] + bounds[2], bottom: bounds[1] + bounds[3] }
                : undefined;
            const inViewport = box !== undefined &&
                overlaps(box, { left: viewportLeft, top: viewportTop, right: viewportRight, bottom: viewportBottom }) &&
                overlaps(box, placements.get(frameId)?.visible ?? EVERYWHERE);
            let ref;
            if (targetable && backendNodeId !== undefined) {
                // A frame that reloads gets a new loader while the page keeps its own, so identity
                // is keyed on the loader of the document that actually holds the node.
                const frameLoaderId = frameLoaders.get(frameId);
                const key = `${frameLoaderId ?? loaderId}_${backendNodeId}`;
                ref = this.refByNode.get(key);
                if (!ref) {
                    this.refCounter += 1;
                    ref = `@e${this.refCounter}`;
                    this.refByNode.set(key, ref);
                }
                this.recordByRef.set(ref, {
                    ref,
                    backendNodeId,
                    loaderId,
                    frameId,
                    frameLoaderId,
                    role,
                    name,
                    snapshotId,
                    lastSeenSnapshotId: snapshotId,
                    center,
                });
            }
            const rawValue = nodeFacts?.inputValue ?? (axNode.value ? asString(axNode.value.value) : undefined);
            // A node the DOM snapshot never saw — a frame that re-rendered between the two reads —
            // has no attributes to say whether its value is a secret. Unknown means redacted.
            const sensitive = nodeFacts === undefined
                ? rawValue !== undefined
                : isSensitiveField({
                    tagName: nodeFacts.tagName,
                    type: nodeFacts.attributes.type,
                    name: nodeFacts.attributes.name,
                    id: nodeFacts.attributes.id,
                    autocomplete: nodeFacts.attributes.autocomplete,
                });
            const value = rawValue === undefined ? undefined : sensitive ? redactSensitiveValue(rawValue) : cleanText(rawValue);
            const properties = {};
            for (const property of axNode.properties ?? []) {
                if (!USEFUL_PROPERTIES.has(property.name))
                    continue;
                const propertyValue = property.value?.value;
                if (propertyValue === undefined || propertyValue === false || propertyValue === 'false')
                    continue;
                properties[property.name] = propertyValue;
            }
            const embedded = backendNodeId === undefined ? undefined : frameByOwner.get(backendNodeId);
            if (nodeFacts?.tagName === 'IFRAME' && embedded === undefined && isVisibleFrame(nodeFacts)) {
                // A frame in another process is not in this snapshot at all, so its contents are
                // simply absent. Say so and hand over its URL: opening that directly makes it the
                // top document, which this pipeline can read in full.
                unreadableFrames += 1;
                const source = cleanText(nodeFacts.attributes.src ?? '');
                if (source)
                    properties.url = source;
            }
            // A StaticText child that only repeats its parent's name is pure duplication.
            const repeatsParent = role === 'StaticText' && name !== '' && parentName.includes(name);
            const keep = !repeatsParent &&
                (options.interactiveOnly === false ||
                    ref !== undefined ||
                    TEXT_BEARING_ROLES.has(role) ||
                    name.length > 0);
            if (keep) {
                nodes.push({
                    ref,
                    role,
                    name,
                    nameInferred: accessibleName === '' && inferredName !== '',
                    value,
                    backendNodeId: backendNodeId ?? -1,
                    depth,
                    inViewport,
                    interactive: ref !== undefined,
                    sensitive,
                    properties: Object.keys(properties).length > 0 ? properties : undefined,
                    center,
                });
            }
            const childDepth = keep ? depth + 1 : depth;
            for (const child of children)
                visit(child, frameId, childDepth, name || parentName);
            if (embedded !== undefined) {
                for (const root of rootsOf(embedded))
                    visit(root, embedded, childDepth, name || parentName);
            }
        };
        for (const root of rootsOf(topDocument?.frameId ?? ''))
            visit(root, topDocument?.frameId ?? '', 0, '');
        const snapshot = {
            snapshotId,
            loaderId,
            url,
            title: cleanText(nodes[0]?.name ?? ''),
            nodes,
            text: renderSnapshot(nodes),
            truncated,
            unreadableFrames,
        };
        this.latest = snapshot;
        return snapshot;
    }
    /** Resolves a `@eN` ref, throwing a precise error naming why it no longer works. */
    resolveRef(ref) {
        const record = this.recordByRef.get(ref);
        if (!record) {
            throw new SteelToolError(`${ref} is not a reference this page has issued. Call steel_snapshot or steel_find to get current refs.`, { code: 'ref_not_found', details: { ref } });
        }
        const currentSnapshotId = this.latest?.snapshotId ?? record.snapshotId;
        // A frame that loaded a new document keeps its id and changes its loader; a frame that is
        // gone altogether has no loader any more, and its node went with it.
        const frameLoaderNow = this.frameLoaders.get(record.frameId);
        const frameReloaded = record.frameLoaderId !== undefined &&
            frameLoaderNow !== undefined &&
            frameLoaderNow !== record.frameLoaderId;
        const reason = record.loaderId !== this.currentLoaderId
            ? 'page_navigated'
            : frameReloaded
                ? 'frame_navigated'
                : record.lastSeenSnapshotId !== currentSnapshotId
                    ? 'node_removed'
                    : undefined;
        if (reason) {
            throw staleRefError(ref, {
                refSnapshotId: record.snapshotId,
                currentSnapshotId,
                reason,
            });
        }
        return record;
    }
    /**
     * Verifies that a target still has the role and accessible name the snapshot recorded.
     *
     * Acting on an element relabelled from `Save` to `Delete everything` between the read and the
     * click is the failure mode this prevents. A cosmetic relabel is not: a button that goes from
     * `Save` to `Saving…` is the same button, and refusing to click it would trade a real bug for
     * a worse one. So a role change always counts, and a name change counts only when neither name
     * contains the other.
     */
    assertIdentityUnchanged(ref, live) {
        const record = this.recordByRef.get(ref);
        if (!record)
            return;
        if (!identityChanged(record, live))
            return;
        throw staleRefError(ref, {
            refSnapshotId: record.snapshotId,
            currentSnapshotId: this.latest?.snapshotId ?? record.snapshotId,
            reason: 'role_or_name_changed',
        });
    }
}
//# sourceMappingURL=snapshot.js.map