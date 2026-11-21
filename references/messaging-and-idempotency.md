# Messaging, deduplication and recovery

## Delivery contract
Define message key, payload schema version, producer transaction, consumer idempotency boundary, retry classification, visibility timeout, dead-letter policy and replay authorization. Assume at-least-once delivery unless actual infrastructure proves stronger semantics.

## Durable idempotency
Scope key by tenant and operation; bind it to a request digest; store state (`in_progress`, `committed`, `failed_retryable`) and outcome durably; atomically commit the business effect with the idempotency record where possible. If a lease is used, define expiration and takeover behavior.

## Fault matrix
- Concurrent same key / same payload: one business effect.
- Concurrent same key / different payload: explicit conflict.
- Crash before commit: retry can complete.
- Crash after commit before response: retry returns recorded outcome without duplicate effect.
- Redelivery and out-of-order event: consumer remains correct.

## Evidence
Use a persistent side-effect counter, unique business identifiers, crash/restart harness and deterministic barrier; HTTP response equality alone is not enough.
