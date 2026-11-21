# Failure budgets, observability and delivery

## Deadline and retry budget
End-to-end deadline must bound connect, queue, execution and response time. Retry only transient errors and only when operation is safe to repeat; cap attempts, use jitter and respect remaining deadline. Add circuit breaking only when it addresses a measured failure mode.

## Telemetry
Log request ID, operation, sanitized error code, duration and trace correlation; measure p50/p95/p99 latency, error ratio, saturation, queue age and database pool wait. Do not log secrets or entire request bodies.

## Rollout
Define health readiness separate from liveness; perform backward-compatible migration; release gradually when supported; check SLO against baseline; define automatic or manual rollback trigger and responsible owner.

## Fault tests
Inject slow dependency, connection refusal, queue saturation, SIGTERM during work and restart after commit. Record observed behavior and cleanup of pending work.
