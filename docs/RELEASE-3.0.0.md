# Steel MCP 3.0.0

This release fixes browser action safety, page-content isolation, concurrent session limits,
hosted tenant retention, shutdown cleanup, waits, handoff negotiation, and listener cleanup.

## Migration from 2.x

- `steel_navigate` and `steel_session_release` no longer return `structuredContent.title`.
  Page titles remain available in fenced page-state text. Keep that text fenced when passing it
  to a model: page-controlled titles are untrusted content.
- Custom `HandleRegistry` implementations must implement `reserveSessionSlot` and
  `releaseSessionSlot`. Reservations must atomically count pending creates and live sessions
  against the principal's limit, expire at the session's hard expiry, and be released after
  confirmed session cleanup. Shared stores must coordinate across replicas. The built-in memory
  and Redis registries implement this contract.
- `steel_wait_for` now requires every supplied condition to match. Callers that intended to
  wait for only text, a selector, or a URL should pass only that condition.

Claude Desktop users can install the new MCPB without changing their Steel API key configuration.
Self-hosters must deploy the new server separately; publishing the MCPB does not update a hosted
service. When upgrading a shared Redis deployment, replace all old replicas before relying on
the new atomic capacity limit: 2.x writers do not participate in reservations.

## Fixes

- Overlay dismissal only clicks verified consent controls with an unobstructed hit target.
- Page titles stay inside untrusted-content fences.
- Hosted discovery does not retain a tenant; tenant caches have bounded capacity and idle eviction.
- Shutdown attempts every session and pool cleanup, including sessions under human control.
- Concurrent session creation reserves capacity before contacting Steel and preserves reservations
  when cleanup cannot be confirmed.
- Wait descriptions and evaluation use the same set of conditions.
- URL-only elicitation clients are not treated as form-elicitation clients.
- Failed navigation and actions dispose their page-settling listeners.
