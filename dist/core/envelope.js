const SECTION_ORDER = [
    ['result', 'Result'],
    ['pageState', 'Page state'],
    ['change', 'Change'],
    ['snapshot', 'Snapshot'],
    ['links', 'Links'],
    ['notes', 'Notes'],
    ['pagination', 'Pagination'],
];
/** Renders sections into a skimmable, per-section-truncatable, testable block of markdown. */
export function renderEnvelope(sections) {
    const blocks = [];
    for (const [key, heading] of SECTION_ORDER) {
        const value = sections[key];
        if (value === undefined)
            continue;
        const body = Array.isArray(value) ? value.map(note => `- ${note}`).join('\n') : value;
        if (body.trim().length === 0)
            continue;
        blocks.push(`### ${heading}\n${body}`);
    }
    return blocks.join('\n\n');
}
/**
 * Describes what actually changed.
 *
 * An action that reports plain success while nothing happened is the worst available failure
 * mode: the model concludes the application is broken rather than that it aimed at the wrong
 * element. So "nothing changed" is stated out loud, with the likely causes.
 */
export function describeChange(signal) {
    const parts = [];
    if (signal.navigated) {
        const destination = signal.navigatedToUrl ?? 'a new page';
        parts.push(signal.navigatedInFrame ? `The target's frame navigated to ${destination}.` : `Navigated to ${destination}.`);
    }
    if (signal.domMutated) {
        parts.push('The DOM changed.');
    }
    if (signal.focusChanged) {
        parts.push('Focus moved to the target.');
    }
    if (parts.length === 0) {
        parts.push(signal.frameUnobserved
            ? 'No change was observed on the page, but the target is inside a frame whose own DOM changes are ' +
                'not observed, so the action may well have worked. Take a fresh snapshot to see the result; ' +
                'do not repeat the action on the strength of this message.'
            : 'Nothing changed: no navigation, no DOM mutation and no focus change. The click may have hit the ' +
                'wrong element, or the target may not react to this action. Take a fresh snapshot before retrying.');
    }
    else if (signal.frameUnobserved && !signal.domMutated && !signal.navigated) {
        parts.push("DOM changes inside the target's frame are not observed; a fresh snapshot shows the result.");
    }
    if (signal.timedOut) {
        parts.push('The page was still busy when the wait budget expired, so later changes may not be reflected.');
    }
    return parts.join(' ');
}
/** Builds a successful tool result from envelope sections plus optional extra content blocks. */
export function successResult(sections, structuredContent, extraContent = [], resultMeta) {
    const result = {
        content: [{ type: 'text', text: renderEnvelope(sections) }, ...extraContent],
    };
    if (structuredContent)
        result.structuredContent = structuredContent;
    if (resultMeta)
        result._meta = resultMeta;
    return result;
}
//# sourceMappingURL=envelope.js.map