/** A running trace pipeline, so an entrypoint can flush spans before the process exits. */
export interface TracingHandle {
    shutdown(): Promise<void>;
}
/** Starts a pipeline. Injected so a test can assert the wiring without an exporter or a collector. */
export type TracingStarter = (options: {
    serviceName: string;
}) => Promise<TracingHandle>;
export interface StartTracingOptions {
    start?: TracingStarter | undefined;
    /** Where a "tracing was asked for but could not start" message goes. */
    onWarn?: ((message: string) => void) | undefined;
}
/** True when the environment asks for traces, following the standard OTEL variables. */
export declare function tracingRequested(env: Record<string, string | undefined>): boolean;
/**
 * Starts tracing if the environment asked for it, and answers with nothing if it did not.
 *
 * Called once per process, before serving: the stdio entrypoint does it on startup, and a hosted
 * deployment does it around whatever listens in front of `createSteelHttpHandler`. Nothing in the
 * core needs the handle — it resolves the registered tracer through the OpenTelemetry API — so the
 * handle exists only to flush spans on the way out.
 *
 * Failing to start is reported and then ignored: telemetry is never a reason to refuse to serve
 * browser sessions, and the core keeps working against the no-op tracer.
 */
export declare function startTracing(env: Record<string, string | undefined>, options?: StartTracingOptions): Promise<TracingHandle | undefined>;
