// ABOUTME: Thin typed REST client for the Steel /v1 surface, with the fetch implementation injected
// ABOUTME: so tests exercise the wire shape without a network, and every failure mapped to prose.
import { trace } from '@opentelemetry/api';
import { mapSteelHttpError, SteelToolError } from '../errors.js';
import { activeTraceparent, resolveTracer, withSteelCallSpan } from '../telemetry.js';
import { stripInvisible } from '../untrusted.js';
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function safeMetadata(value, max) {
    return stripInvisible(value).slice(0, max);
}
function profile(value) {
    const item = object(value);
    if (!item)
        return undefined;
    const { id, status, createdAt, updatedAt } = item;
    if (typeof id !== 'string' ||
        (status !== 'READY' && status !== 'UPLOADING' && status !== 'FAILED') ||
        typeof createdAt !== 'string' ||
        typeof updatedAt !== 'string')
        return undefined;
    return {
        id: safeMetadata(id, 64),
        status,
        createdAt: safeMetadata(createdAt, 40),
        updatedAt: safeMetadata(updatedAt, 40),
    };
}
function credential(value) {
    const item = object(value);
    if (!item)
        return undefined;
    const { namespace, origin, createdAt, updatedAt } = item;
    if (typeof namespace !== 'string' ||
        typeof origin !== 'string' ||
        typeof createdAt !== 'string' ||
        typeof updatedAt !== 'string')
        return undefined;
    return {
        namespace: safeMetadata(namespace, 100),
        origin: safeMetadata(origin, 2_048),
        createdAt: safeMetadata(createdAt, 40),
        updatedAt: safeMetadata(updatedAt, 40),
    };
}
function dropUndefined(body) {
    return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}
async function readErrorBody(response) {
    try {
        const parsed = await response.json();
        if (parsed && typeof parsed === 'object')
            return parsed;
    }
    catch {
        // A gateway in front of Steel can answer with HTML; fall through to the status-only message.
    }
    return { message: `Steel returned HTTP ${response.status} ${response.statusText}`.trim() };
}
function parseRetryAfter(response) {
    const header = response.headers.get('retry-after');
    if (!header)
        return undefined;
    const seconds = Number.parseInt(header, 10);
    return Number.isFinite(seconds) ? seconds : undefined;
}
/** Typed access to the Steel REST endpoints this server needs. */
export class SteelRestClient {
    config;
    fetchImpl;
    tracer;
    constructor(config, fetchImpl = globalThis.fetch, tracer = resolveTracer()) {
        this.config = config;
        this.fetchImpl = fetchImpl;
        this.tracer = tracer;
    }
    /** Wraps every call in a client span, which is also what the outbound traceparent names. */
    async request(spec) {
        return withSteelCallSpan(this.tracer, {
            method: spec.method,
            path: `/v1${spec.path.replace(/\?.*$/, '')}`,
            host: new URL(this.config.baseUrl).host,
            operation: spec.operation,
        }, () => this.send(spec));
    }
    async send(spec) {
        const headers = { accept: spec.accept ?? 'application/json' };
        if (this.config.apiKey)
            headers.authorization = `Bearer ${this.config.apiKey}`;
        if (spec.body)
            headers['content-type'] = 'application/json';
        // Only set when something is actually tracing, so an untraced deployment sends what it always did.
        const traceparent = activeTraceparent();
        if (traceparent)
            headers.traceparent = traceparent;
        const init = { method: spec.method, headers };
        if (spec.body)
            init.body = JSON.stringify(dropUndefined(spec.body));
        if (spec.signal)
            init.signal = spec.signal;
        let response;
        try {
            response = await this.fetchImpl(`${this.config.baseUrl}/v1${spec.path}`, init);
        }
        catch (cause) {
            if (spec.signal?.aborted) {
                throw new SteelToolError('The request was cancelled by the caller.', { code: 'timeout' });
            }
            throw new SteelToolError(`Could not reach Steel at ${this.config.baseUrl}: ${cause instanceof Error ? cause.message : String(cause)}`, { code: 'steel_error' });
        }
        trace.getActiveSpan()?.setAttribute('http.response.status_code', response.status);
        if (spec.tolerate?.includes(response.status))
            return undefined;
        if (!response.ok) {
            throw mapSteelHttpError(response.status, await readErrorBody(response), {
                operation: spec.operation,
                retryAfterSeconds: parseRetryAfter(response),
            });
        }
        if (response.status === 204)
            return undefined;
        if (spec.responseType === 'text')
            return (await response.text());
        return (await response.json());
    }
    async requireJson(spec) {
        const result = await this.request(spec);
        if (result === undefined) {
            throw new SteelToolError(`Steel returned an empty body for ${spec.path}.`, { code: 'steel_error' });
        }
        return result;
    }
    async requireText(spec) {
        const result = await this.request({ ...spec, responseType: 'text' });
        if (result === undefined) {
            throw new SteelToolError(`Steel returned an empty body for ${spec.path}.`, { code: 'steel_error' });
        }
        return result;
    }
    async scrape(request, signal) {
        return this.requireJson({
            method: 'POST',
            path: '/scrape',
            operation: 'browser_tool',
            signal,
            body: {
                url: request.url,
                format: request.format,
                delay: request.delay,
                useProxy: request.useProxy,
                screenshot: request.screenshot,
                pdf: request.pdf,
            },
        });
    }
    async screenshot(request, signal) {
        return this.requireJson({
            method: 'POST',
            path: '/screenshot',
            operation: 'browser_tool',
            signal,
            body: {
                url: request.url,
                fullPage: request.fullPage,
                delay: request.delay,
                useProxy: request.useProxy,
            },
        });
    }
    async pdf(request, signal) {
        return this.requireJson({
            method: 'POST',
            path: '/pdf',
            operation: 'browser_tool',
            signal,
            body: { url: request.url, delay: request.delay, useProxy: request.useProxy },
        });
    }
    async createSession(request, signal) {
        return this.requireJson({
            method: 'POST',
            path: '/sessions',
            operation: 'session_create',
            signal,
            body: { ...request },
        });
    }
    async releaseSession(sessionId, signal) {
        await this.request({
            method: 'POST',
            path: `/sessions/${encodeURIComponent(sessionId)}/release`,
            operation: 'session_release',
            signal,
            // Releasing an already-released or unknown session is a no-op, not a failure.
            tolerate: [404],
        });
    }
    /** Lists organization sessions newest-first so a finished session can be inspected by id. */
    async listSessions(request, signal) {
        const query = new URLSearchParams();
        if (request.status)
            query.set('status', request.status);
        if (request.limit !== undefined)
            query.set('limit', String(request.limit));
        if (request.cursorId)
            query.set('cursorId', request.cursorId);
        const suffix = query.toString();
        const result = await this.requireJson({
            method: 'GET',
            path: `/sessions${suffix ? `?${suffix}` : ''}`,
            operation: 'account',
            signal,
        });
        return { ...result, sessions: Array.isArray(result.sessions) ? result.sessions : [] };
    }
    async getSession(sessionId, signal) {
        return this.requireJson({
            method: 'GET',
            path: `/sessions/${encodeURIComponent(sessionId)}`,
            operation: 'account',
            signal,
        });
    }
    /** Reads the durable recording playlist for a finished, headed session. */
    async getSessionHls(sessionId, signal) {
        const playlist = await this.requireText({
            method: 'GET',
            path: `/sessions/${encodeURIComponent(sessionId)}/hls`,
            operation: 'account',
            signal,
            accept: 'application/vnd.apple.mpegurl',
        });
        if (!/^#EXTM3U(?:\r?\n|$)/.test(playlist)) {
            // Never include the body here: a playlist contains presigned recording URLs.
            throw new SteelToolError('Steel returned an invalid HLS playlist.', { code: 'steel_error' });
        }
        return playlist;
    }
    async getDetails(signal) {
        return this.requireJson({
            method: 'GET',
            path: '/details',
            operation: 'account',
            signal,
        });
    }
    async listProfiles(signal) {
        const raw = await this.requireJson({ method: 'GET', path: '/profiles', operation: 'account', signal });
        const items = object(raw)?.profiles;
        if (!Array.isArray(items))
            throw new SteelToolError('Steel returned an invalid profile catalog.', { code: 'steel_error' });
        return items.map(profile).filter((item) => item !== undefined);
    }
    async getProfile(profileId, signal) {
        const raw = await this.requireJson({
            method: 'GET',
            path: `/profiles/${encodeURIComponent(profileId)}`,
            operation: 'account',
            signal,
        });
        const projected = profile(raw);
        if (!projected)
            throw new SteelToolError('Steel returned invalid profile metadata.', { code: 'steel_error' });
        return projected;
    }
    async listCredentials(request, signal) {
        const query = new URLSearchParams({ origin: request.origin });
        if (request.namespace !== undefined)
            query.set('namespace', request.namespace);
        const raw = await this.requireJson({
            method: 'GET',
            path: `/credentials?${query}`,
            operation: 'account',
            signal,
        });
        const items = object(raw)?.credentials;
        if (!Array.isArray(items))
            throw new SteelToolError('Steel returned an invalid credential catalog.', { code: 'steel_error' });
        return items
            .map(credential)
            .filter((item) => item !== undefined &&
            item.origin === request.origin &&
            (request.namespace === undefined || item.namespace === request.namespace));
    }
    /**
     * Reads the trace timeline, which arrives as an `{events,total,hasMore}` envelope rather than a
     * bare array. The envelope is passed through so a caller can see that Steel holds more activity
     * than it sent; only a missing `events` is normalised, so a shape surprise cannot become a
     * TypeError in a renderer.
     */
    async getAgentTraces(sessionId, signal) {
        const timeline = await this.requireJson({
            method: 'GET',
            path: `/sessions/${encodeURIComponent(sessionId)}/agent-traces`,
            operation: 'account',
            signal,
        });
        return { ...timeline, events: Array.isArray(timeline.events) ? timeline.events : [] };
    }
    /** Reads the session log, which uses the same envelope as `agent-traces` and is normalised alike. */
    async getSessionLogs(sessionId, signal) {
        const timeline = await this.requireJson({
            method: 'GET',
            path: `/sessions/${encodeURIComponent(sessionId)}/logs`,
            operation: 'account',
            signal,
        });
        return { ...timeline, events: Array.isArray(timeline.events) ? timeline.events : [] };
    }
}
//# sourceMappingURL=rest.js.map