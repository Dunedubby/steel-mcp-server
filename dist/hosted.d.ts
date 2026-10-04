#!/usr/bin/env node
import { type HostedRuntimeOptions } from './hosted-runtime.js';
export type LogLevel = 'info' | 'error';
export type Log = (level: LogLevel, message: string, fields?: Record<string, unknown>) => void;
export interface HostedServerOptions {
    env: Record<string, string | undefined>;
    /** Test seams for the Steel clients a request gets; production uses the runtime's own. */
    runtime?: Pick<HostedRuntimeOptions, 'createApi' | 'createPool' | 'createLimiter' | 'now'> | undefined;
    log?: Log | undefined;
}
export interface HostedServer {
    /** The bound port, which is the assigned one when `PORT` is 0. */
    port: number;
    /** Stops accepting, then releases every session this replica still holds. */
    close(): Promise<void>;
}
/**
 * Starts the hosted server.
 *
 * Every caller authenticates to Steel with their own key, so the configuration is built per
 * credential rather than once. The environment supplies everything else: the endpoint, the profile,
 * the timeouts, and — with `REDIS_URL` — the shared handle store that lets one replica serve a
 * handle another minted.
 */
export declare function startHostedServer(options: HostedServerOptions): Promise<HostedServer>;
