import { type Tracer } from '@opentelemetry/api';
import type { SteelConfig } from '../config.js';
import type { AccountDetails, AgentTraceTimeline, ArtifactRequest, ArtifactResponse, CreateSessionRequest, ScrapeRequest, ScrapeResponse, SessionListRequest, SessionListResponse, SessionLogTimeline, SteelApi, SteelCredentialSummary, SteelProfileSummary, SteelSession } from './types.js';
/** The subset of `fetch` this client uses, so a test can supply a plain function. */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
/** Typed access to the Steel REST endpoints this server needs. */
export declare class SteelRestClient implements SteelApi {
    private readonly config;
    private readonly fetchImpl;
    private readonly tracer;
    constructor(config: SteelConfig, fetchImpl?: FetchLike, tracer?: Tracer);
    /** Wraps every call in a client span, which is also what the outbound traceparent names. */
    private request;
    private send;
    private requireJson;
    private requireText;
    scrape(request: ScrapeRequest, signal?: AbortSignal): Promise<ScrapeResponse>;
    screenshot(request: ArtifactRequest, signal?: AbortSignal): Promise<ArtifactResponse>;
    pdf(request: ArtifactRequest, signal?: AbortSignal): Promise<ArtifactResponse>;
    createSession(request: CreateSessionRequest, signal?: AbortSignal): Promise<SteelSession>;
    releaseSession(sessionId: string, signal?: AbortSignal): Promise<void>;
    /** Lists organization sessions newest-first so a finished session can be inspected by id. */
    listSessions(request: SessionListRequest, signal?: AbortSignal): Promise<SessionListResponse>;
    getSession(sessionId: string, signal?: AbortSignal): Promise<SteelSession>;
    /** Reads the durable recording playlist for a finished, headed session. */
    getSessionHls(sessionId: string, signal?: AbortSignal): Promise<string>;
    getDetails(signal?: AbortSignal): Promise<AccountDetails>;
    listProfiles(signal?: AbortSignal): Promise<SteelProfileSummary[]>;
    getProfile(profileId: string, signal?: AbortSignal): Promise<SteelProfileSummary>;
    listCredentials(request: {
        origin: string;
        namespace?: string;
    }, signal?: AbortSignal): Promise<SteelCredentialSummary[]>;
    /**
     * Reads the trace timeline, which arrives as an `{events,total,hasMore}` envelope rather than a
     * bare array. The envelope is passed through so a caller can see that Steel holds more activity
     * than it sent; only a missing `events` is normalised, so a shape surprise cannot become a
     * TypeError in a renderer.
     */
    getAgentTraces(sessionId: string, signal?: AbortSignal): Promise<AgentTraceTimeline>;
    /** Reads the session log, which uses the same envelope as `agent-traces` and is normalised alike. */
    getSessionLogs(sessionId: string, signal?: AbortSignal): Promise<SessionLogTimeline>;
}
