import type { RedisCommands } from './registry-redis.js';
/**
 * The slice of an ioredis client this adapter uses.
 *
 * Narrow on purpose: the command mapping, including the millisecond expiry, is then testable
 * against a recording double instead of a server.
 */
export interface RedisClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
    set(key: string, value: string, mode: 'PX', ttlMs: number, condition: 'NX'): Promise<unknown>;
    eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    pexpire(key: string, ttlMs: number): Promise<number>;
    sadd(key: string, member: string): Promise<number>;
    srem(key: string, member: string): Promise<number>;
    smembers(key: string): Promise<string[]>;
    quit(): Promise<unknown>;
    on(event: 'error', listener: (error: Error) => void): unknown;
}
export interface RedisConnection {
    commands: RedisCommands;
    close(): Promise<void>;
}
/**
 * Wraps a client as a registry command interface and attaches the error reporter.
 *
 * The listener is not optional politeness: a Redis client emits `error` on every failed reconnect,
 * and an `error` event with no listener is an uncaught exception that takes the replica with it.
 */
export declare function redisConnection(client: RedisClient, onError: (error: unknown) => void): RedisConnection;
/** Connects to Redis over a `redis://` or `rediss://` URL, reporting every client error to `onError`. */
export declare function connectRedis(url: string, onError: (error: unknown) => void): RedisConnection;
