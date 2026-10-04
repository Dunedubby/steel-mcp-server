/** The `ui://` resource URI the app is served under. */
export declare const SESSION_VIEWER_URI = "ui://steel/session-viewer";
/** MIME type `resources/read` must report for a host to render the app as an MCP App. */
export declare const SESSION_VIEWER_MIME_TYPE = "text/html;profile=mcp-app";
/**
 * The app-only tool the app calls, with `{ session_id }`, to get its connection details.
 *
 * Its `structuredContent` answers `{ cdp_url, viewport: { width, height }, expires_at }`. `cdp_url`
 * is a drive-capable credential: it is validated, opened, and never rendered, logged or put in the
 * DOM. See `validateCdpUrl` and `scrubCredentials`.
 */
export declare const SESSION_VIEWER_LIVE_VIEW_TOOL = "steel_session_live_view";
/**
 * Message the app posts to its parent once its host handshake is done.
 *
 * The MCP Apps bridge already tells a conforming host when the app is ready
 * (`ui/notifications/initialized`); this is the plain-postMessage echo of the same fact, so a test
 * harness or a non-MCP embedder can wait for the app without speaking JSON-RPC.
 */
export declare const SESSION_VIEWER_READY_MESSAGE_TYPE = "steel-mcp:viewer-ready";
/**
 * How long with no frame before the app says the page is idle rather than live.
 *
 * A screencast is repaint-driven, not a frame rate: a page that is not changing sends nothing at
 * all. The viewer must not read that as a fault, so this is the boundary between "painting" and
 * "connected, page idle", never between working and broken.
 */
export declare const SESSION_VIEWER_IDLE_AFTER_MS = 1500;
/** A validated CDP socket URL and the host it is pinned to for the rest of the app's life. */
export interface CdpTarget {
    readonly url: string;
    readonly host: string;
}
/**
 * Validates a CDP socket URL and returns it unchanged plus its host, or `null`.
 *
 * The URL arrives at runtime from a tool result and carries a token that can drive the browser, so
 * it is checked before a socket is opened: `wss:` only, no userinfo (`wss://connect.steel.dev@evil`
 * reads as the expected host), and once a host has been accepted every later URL must match it, so
 * a second call cannot move the app to another origin. The string is returned byte for byte because
 * the query is the credential and must reach Steel exactly as issued.
 *
 * Runs both in Node (tested) and in the app, where it is embedded by source, so its body must
 * reference nothing outside itself.
 */
export declare function validateCdpUrl(raw: unknown, pinnedHost: string | null): CdpTarget | null;
/**
 * Strips credentials out of a message before it is shown, and truncates it.
 *
 * Every string the app displays goes through this: socket URLs lose their query, credential
 * parameters and JWTs are replaced. A token must never reach the DOM, not even inside an error
 * message the browser or the host wrote.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function scrubCredentials(text: unknown): string;
/**
 * Reads `session_id` out of a tool result the host pushed to the app, or `null`.
 *
 * The id is already in the conversation, so it is not sensitive; it is still shape-checked because
 * it goes straight back out as a tool argument. Any result without one — another tool's, or one
 * with no structured content — is ignored rather than guessed at.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readSessionIdFromToolResult(result: unknown): string | null;
/** What the live-view tool tells the app: where to connect, how big the page is, when access ends. */
export interface LiveView {
    readonly sessionId: string;
    readonly cdpUrl: string;
    /** Captured viewport width in CSS pixels, or `0` when the tool did not say. */
    readonly width: number;
    /** Captured viewport height in CSS pixels, or `0` when the tool did not say. */
    readonly height: number;
    /** Epoch milliseconds the access window ends, or `null` when the tool did not say. */
    readonly expiresAt: number | null;
}
/**
 * Reads the live-view tool's connection details, or `null` when it returned none.
 *
 * The expiry is accepted as an ISO timestamp, epoch milliseconds or epoch seconds and normalised to
 * milliseconds; an unusable viewport or expiry is reported as unknown rather than invented, because
 * the app says "expired" only when it actually knows the window has passed.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readLiveView(result: unknown): LiveView | null;
export interface ViewerControlLease {
    token: string;
    leaseExpiresAt: number;
}
/** Reads the opaque control token returned only to this app. Embedded into the viewer by source. */
export declare function readControlLease(result: unknown): ViewerControlLease | null;
/**
 * Reads the message off a tool result that reports failure, or `null` when it succeeded.
 *
 * A failed `tools/call` resolves with `isError: true` rather than rejecting, so without this the app
 * would report "no usable details" when the tool had already said something more useful.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readToolErrorText(result: unknown): string | null;
/**
 * Parses one socket message into an object, or `null`.
 *
 * Binary frames and oversized payloads are refused outright: everything CDP sends the app is JSON,
 * and a screencast frame of a full viewport is orders of magnitude below the cap.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function parseSocketMessage(raw: unknown): object | null;
/** A reply to one CDP command, with any failure already reduced to a message. */
export interface CdpReply {
    readonly id: number;
    readonly result: unknown;
    readonly errorMessage: string | null;
}
/**
 * Reads a CDP command reply, or `null` when the message is an event instead.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readCdpReply(message: unknown): CdpReply | null;
/** A remote file input Chrome asked the controlling person to populate. */
export interface FileChooserTarget {
    readonly backendNodeId: number;
}
/** Reads only the node id from Chrome's trusted file-chooser event. Embedded into the app by source. */
export declare function readFileChooserTarget(message: unknown): FileChooserTarget | null;
/** The screencast frame metadata the coordinate mapping needs, all of it verified present. */
export interface ScreencastMetadata {
    readonly offsetTop: number;
    readonly pageScaleFactor: number;
    readonly deviceWidth: number;
    readonly deviceHeight: number;
    readonly scrollOffsetX: number;
    readonly scrollOffsetY: number;
}
/** One decoded screencast frame: what to draw, what to ack with, and where the page was. */
export interface ScreencastFrame {
    /**
     * The frame's own session id, which `Page.screencastFrameAck` must echo or the stream stalls.
     *
     * Chrome types this as an `int32` on both the event and the ack command, and refuses an ack
     * carrying anything else, so it stays a number all the way back out.
     */
    readonly ackSessionId: number;
    readonly dataUrl: string;
    readonly metadata: ScreencastMetadata;
}
/**
 * Reads a `Page.screencastFrame` event into something drawable, or `null`.
 *
 * The payload is checked to be plain base64 before it is put in a `data:` URL, so no attacker-chosen
 * MIME type, comma or semicolon can escape into it, and the metadata is checked to be finite and
 * positive so the coordinate mapping cannot divide by zero later.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readScreencastFrame(message: unknown): ScreencastFrame | null;
/**
 * Picks the page target to screencast out of a `Target.getTargets` reply, or `null`.
 *
 * Only `type === 'page'` can be screencast, and DevTools and extension pages are skipped because
 * they are not the page the agent is driving.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function pickPageTargetId(result: unknown): string | null;
/**
 * Reads the flat session id off a `Target.attachToTarget` reply, or `null`.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readAttachedSessionId(result: unknown): string | null;
/** A JSON-RPC response to one of the app's own bridge requests. */
export interface BridgeResponse {
    readonly id: number | string;
    readonly result: unknown;
    readonly error: unknown;
}
/**
 * Reads a JSON-RPC response to one of the app's bridge requests, or `null`.
 *
 * A request carrying a `method` is never a response, which matters because a same-window post is
 * echoed back to the app itself.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readBridgeResponse(data: unknown): BridgeResponse | null;
/**
 * Reads the params off a `ui/notifications/tool-result` push, or `null`.
 *
 * This is the only host message the app takes data from, and only as a notification: a message with
 * an id is a request and is answered elsewhere, never mined for a session.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readToolResultNotification(data: unknown): object | null;
/**
 * Reads the id of a `ui/resource-teardown` request so it can be answered, or `null`.
 *
 * The host sends this before it removes the app, and it is the app's cue to stop the screencast and
 * close the socket rather than leave a stream running against a view nobody can see.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function readTeardownRequest(data: unknown): {
    id: number | string;
} | null;
/** A point in the live page, in CSS pixels: relative to the viewport, and to the document. */
export interface PagePoint {
    /** What `Input.dispatchMouseEvent` takes: CSS pixels from the top left of the viewport. */
    readonly viewportX: number;
    readonly viewportY: number;
    /** The same point in document space, scroll included. */
    readonly pageX: number;
    readonly pageY: number;
}
/**
 * Maps a point on the rendered canvas to a point in the live page, or `null` if it maps nowhere.
 *
 * The canvas holds the JPEG at its natural pixel size and is displayed contained in its box, so the
 * frame is scaled by `min(box/device)` and centred, leaving letterbox bars on one axis. Undoing that
 * gives a point in the captured frame's device-independent pixels; dividing by `pageScaleFactor` and
 * subtracting `offsetTop` (the height of the browser's own top chrome inside the capture) gives
 * viewport CSS pixels, and adding the scroll offsets gives document CSS pixels. A point in the
 * letterbox is not in the page at all and returns `null`, so a click there can never be forwarded.
 *
 * Pure, tested here, and embedded into the app by source; its body must reference nothing outside
 * itself.
 */
export declare function mapCanvasPointToPage(point: {
    x: number;
    y: number;
}, box: {
    width: number;
    height: number;
}, metadata: ScreencastMetadata): PagePoint | null;
/**
 * Everything the viewer can honestly be in.
 *
 * `idle` is the one that has to be said carefully: a screencast is repaint-driven, so a page that is
 * not changing sends no frames at all. `expired` is the one a user can act on.
 */
export type ViewerPhase = 'handshake-failed' | 'awaiting-session' | 'live-view-failed' | 'connecting' | 'awaiting-first-frame' | 'painting' | 'idle' | 'closed' | 'expired';
/** What the app knows when it decides what to show. */
export interface ViewerObservation {
    /** The phase the last lifecycle event put the app in. */
    readonly phase: ViewerPhase;
    /** When the last frame was painted, or `null` if none ever was. */
    readonly lastFrameAt: number | null;
    readonly now: number;
    readonly expiresAt: number | null;
    readonly idleAfterMs: number;
}
/**
 * Turns the app's last lifecycle event and its clock into the phase to display.
 *
 * Two facts only this can see: an elapsed `expires_at` explains every connection-stage symptom
 * better than the symptom does, and a stream with no recent frame is an idle page rather than a
 * fault. Failures from before the connection are left alone — the expiry did not cause them.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function resolveViewerPhase(observation: ViewerObservation): ViewerPhase;
/** What to show for a phase: whether anything is in flight, and what to say about it. */
export interface ViewerStatus {
    readonly busy: boolean;
    readonly headline: string;
    readonly detail: string;
}
/**
 * The words for each phase. The app may replace `detail` with a scrubbed message from the failure.
 *
 * Embedded into the app by source; must reference nothing outside itself.
 */
export declare function describeViewerPhase(phase: ViewerPhase): ViewerStatus;
/** One CDP command the app forwards: a method name and its params object, nothing else. */
export interface CdpCommand {
    readonly method: string;
    readonly params: Record<string, unknown>;
}
/**
 * Maps a DOM mouse-event `button` index to the button string CDP takes.
 *
 * The DOM numbers buttons 0/1/2 for left/middle/right and 3/4 for back/forward; CDP names the first
 * three and uses `'none'` for an event with no button. Back and forward collapse to `'none'` rather
 * than a string the page-scoped `Input` dispatch does not need.
 *
 * Pure, unit-tested, and embedded into the app by source; its body references nothing outside itself.
 */
export declare function mapMouseButton(button: unknown): 'left' | 'right' | 'middle' | 'none';
/**
 * The CDP button-state bitmask, clamped to the five bits Chrome defines.
 *
 * The DOM already maintains `MouseEvent.buttons` as exactly this bitmask (1 left, 2 right, 4 middle,
 * 8 back, 16 forward); this only has to refuse a value that is not a finite non-negative integer and
 * drop anything beyond the five real button bits.
 *
 * Pure, unit-tested, and embedded into the app by source; its body references nothing outside itself.
 */
export declare function mouseButtonsBitmask(buttons: unknown): number;
/**
 * The click count a DOM event carries (2 for a double click), or a single click.
 *
 * `MouseEvent.detail` is the count the browser already keeps across a burst of clicks, so it is read
 * verbatim and a malformed or missing value falls back to one rather than to zero.
 *
 * Pure, unit-tested, and embedded into the app by source; its body references nothing outside itself.
 */
export declare function inferClickCount(detail: unknown): number;
/**
 * A scroll delta in CSS pixels, which is what CDP's `mouseWheel` takes.
 *
 * A DOM `WheelEvent` is only in pixels when `deltaMode === 0`; mode 1 is lines and mode 2 is pages,
 * which on some mice (notably Windows) would otherwise arrive as single-digit pixel counts and scroll
 * almost nothing. The line- and page-height conversions are the conventional approximation browsers
 * and automation libraries use, not an exact standard: 16 px per line, ~20 lines per page. Pure,
 * unit-tested, and embedded by source; references nothing outside itself.
 */
export declare function wheelDelta(event: {
    deltaX?: unknown;
    deltaY?: unknown;
    deltaMode?: unknown;
}, axis: 'deltaX' | 'deltaY'): number;
/**
 * The CDP modifier bitmask (alt 1, ctrl 2, meta 4, shift 8) from a DOM event's modifier flags.
 *
 * Pure, unit-tested, and embedded into the app by source; its body references nothing outside itself.
 */
export declare function modifiersBitmask(event: {
    altKey?: unknown;
    ctrlKey?: unknown;
    metaKey?: unknown;
    shiftKey?: unknown;
}): number;
/**
 * Whether a key event carries one printable character that should be inserted as text.
 *
 * A single-character `key` is text; shift alone only changes its case, but any of ctrl/meta/alt turns
 * the press into a shortcut (`Ctrl+C`, `Cmd+V`) that must not also drop a literal character into the
 * page. Multi-character keys (`Enter`, `ArrowLeft`) are never text.
 *
 * Pure, unit-tested, and embedded into the app by source; its body references nothing outside itself.
 */
export declare function isPrintableKey(key: unknown, modifiers: number): boolean;
/**
 * The Windows virtual-key code for a DOM `KeyboardEvent.code`, or 0 when it is unknown.
 *
 * `code` names the physical key (layout-independent), so it is the reliable source for the
 * `windowsVirtualKeyCode` CDP's `Input.dispatchKeyEvent` expects. Letters, digits, the function keys
 * and the control keys a page reacts to are covered; anything else is sent as 0, which CDP treats as
 * "no code" rather than refusing the event.
 *
 * Pure, unit-tested, and embedded into the app by source; its body references nothing outside itself.
 */
export declare function keyCodeFor(code: unknown): number;
/**
 * Builds the CDP mouse command for one pointer event over the live page, or `null` when it must not
 * fire.
 *
 * The point is the viewport coordinate `mapCanvasPointToPage` already returned (or `null` for the
 * letterbox or before a frame arrives); a `null` point, a control mode that is off, and a synthesized
 * `click`/`dblclick` event all build nothing. `mousedown`/`mouseup`/`mousemove` map to the pressed,
 * released and moved CDP types with `clickCount` only on the press and release, and `wheel` maps to a
 * `mouseWheel` carrying the deltas. The command is page-scoped by the app's `cdpSend`, which adds the
 * attached session id.
 *
 * Embedded into the app by source; it calls the sibling serializers above, which are in scope there.
 */
export declare function mapPointerEventToCdp(event: {
    type: unknown;
    button?: unknown;
    buttons?: unknown;
    detail?: unknown;
    deltaX?: unknown;
    deltaY?: unknown;
}, point: {
    viewportX: number;
    viewportY: number;
} | null, driving: boolean): CdpCommand | null;
/**
 * Builds the CDP key command for a `keydown` or `keyup`, or `null` when it must not fire.
 *
 * The dispatch carries the `key` and `code` as the DOM received them, the `windowsVirtualKeyCode` for
 * `code`, and the modifier bitmask; the browser fills in `text` for itself only on a `char` event,
 * which this never sends, so a printable keydown does not insert twice.
 *
 * Embedded into the app by source; it calls the sibling serializers above, which are in scope there.
 */
export declare function mapKeyEventToCdp(event: {
    type: unknown;
    key?: unknown;
    code?: unknown;
    altKey?: unknown;
    ctrlKey?: unknown;
    metaKey?: unknown;
    shiftKey?: unknown;
}, driving: boolean): CdpCommand | null;
/**
 * Builds an `Input.insertText` command for a printable `keydown`, or `null` when it is not text entry.
 *
 * Puppeteer/Playwright insert composing text this way because it is more reliable than encoding it on
 * a key event. Only a single-character key with no ctrl/meta/alt qualifies; shift is allowed so an
 * upper-case letter reaches the page as itself.
 *
 * Embedded into the app by source; it calls the sibling serializers above, which are in scope there.
 */
export declare function mapCharToInsertText(event: {
    type: unknown;
    key?: unknown;
    altKey?: unknown;
    ctrlKey?: unknown;
    metaKey?: unknown;
    shiftKey?: unknown;
}, driving: boolean): CdpCommand | null;
/**
 * The app: one static document, inline CSS and JS only, no subresources and no data of its own.
 *
 * The only values interpolated are the compile-time constants above and the source text of the
 * helpers, so the logic the browser runs is the logic the unit tests ran. Nothing derived from a
 * session, a page or a credential is ever interpolated, and page-derived strings reach the DOM
 * through `textContent` alone.
 *
 * The document's own CSP allows `wss:` generally rather than one host: the app is a single static
 * public resource that cannot know a deployment's CDP host, so the origin allowlist lives in the
 * resource's `_meta.ui.csp.connectDomains`, which the host enforces. Everything else is denied
 * here — no scripts, styles, frames, fonts or network images at all.
 */
export declare const SESSION_VIEWER_HTML: string;
