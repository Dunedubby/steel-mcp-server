import type { CallToolResult, ContentBlock } from '@modelcontextprotocol/server';
import type { SettleResult } from './settle.js';
/** Sections of a tool response. Order is fixed by the renderer, not by the caller. */
export interface EnvelopeSections {
    result?: string | undefined;
    pageState?: string | undefined;
    change?: string | undefined;
    snapshot?: string | undefined;
    links?: string | undefined;
    notes?: string[] | undefined;
    pagination?: string | undefined;
}
/** Renders sections into a skimmable, per-section-truncatable, testable block of markdown. */
export declare function renderEnvelope(sections: EnvelopeSections): string;
/** What the page did in response to an action, beyond what `settle` alone can see. */
export interface ChangeSignal extends SettleResult {
    focusChanged?: boolean | undefined;
    /**
     * True when the target sits in a child frame. The settle pass observes the page's own DOM,
     * so a change confined to that frame goes unseen, and silence is not evidence of no effect.
     */
    frameUnobserved?: boolean | undefined;
}
/**
 * Describes what actually changed.
 *
 * An action that reports plain success while nothing happened is the worst available failure
 * mode: the model concludes the application is broken rather than that it aimed at the wrong
 * element. So "nothing changed" is stated out loud, with the likely causes.
 */
export declare function describeChange(signal: ChangeSignal): string;
/** Builds a successful tool result from envelope sections plus optional extra content blocks. */
export declare function successResult(sections: EnvelopeSections, structuredContent?: Record<string, unknown>, extraContent?: ContentBlock[], resultMeta?: Record<string, unknown>): CallToolResult;
