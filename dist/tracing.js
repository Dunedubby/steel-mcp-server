// ABOUTME: Entrypoint-level OpenTelemetry wiring: starts an OTLP trace pipeline only when a standard
// ABOUTME: OTEL_ variable asks for one, so an unconfigured deployment loads no exporter at all.
/** The service name traces are attributed to when the operator does not choose one. */
const DEFAULT_SERVICE_NAME = 'steel-mcp';
/** Any of these, set to a non-blank value, means "export traces". */
const ENABLING_VARS = ['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'OTEL_TRACES_EXPORTER'];
function setting(env, name) {
    return env[name]?.trim() ?? '';
}
/** True when the environment asks for traces, following the standard OTEL variables. */
export function tracingRequested(env) {
    if (setting(env, 'OTEL_SDK_DISABLED').toLowerCase() === 'true')
        return false;
    if (setting(env, 'OTEL_TRACES_EXPORTER').toLowerCase() === 'none')
        return false;
    return ENABLING_VARS.some(name => setting(env, name) !== '');
}
/**
 * Loads and starts the OTLP SDK.
 *
 * The imports are dynamic and the packages optional: the exporter stack is a large dependency tree
 * that an unconfigured server should never pay for, and one an operator may have omitted entirely.
 * NodeSDK reads the rest of its configuration — endpoint, headers, sampler, resource attributes —
 * from the standard OTEL variables, and registers the context manager span nesting needs.
 */
const startOtlpSdk = async ({ serviceName }) => {
    const [{ NodeSDK }, { OTLPTraceExporter }] = await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/exporter-trace-otlp-http'),
    ]);
    const sdk = new NodeSDK({ serviceName, traceExporter: new OTLPTraceExporter() });
    sdk.start();
    return { shutdown: () => sdk.shutdown() };
};
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
export async function startTracing(env, options = {}) {
    if (!tracingRequested(env))
        return undefined;
    try {
        return await (options.start ?? startOtlpSdk)({
            serviceName: setting(env, 'OTEL_SERVICE_NAME') || DEFAULT_SERVICE_NAME,
        });
    }
    catch (error) {
        options.onWarn?.('Tracing was requested but could not start, so this server is running without it. ' +
            'Install @opentelemetry/sdk-node and @opentelemetry/exporter-trace-otlp-http to enable it. ' +
            `(${error instanceof Error ? error.message : String(error)})`);
        return undefined;
    }
}
//# sourceMappingURL=tracing.js.map