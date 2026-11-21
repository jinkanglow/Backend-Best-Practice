# Algorithm and resource-cost decisions

## Cost model before optimization
Define input cardinality N, concurrency C, request rate R, payload size B, fanout F, and data growth. State which values are measured and which are unknown. Measure latency p50/p95/p99, memory peak, database round trips and queue wait.

## Typical failure mechanisms
- Nested scan over N records: O(N²). For membership checks, benchmark a hash set (expected O(N) build plus O(1) lookup) against sorted binary search (O(log N) lookup); account for memory and ordering needs.
- Pagination by large OFFSET: may scan skipped rows; prefer stable keyset cursor when ordering and filters allow it.
- Unbounded recursive graph traversal: use visited set, explicit depth/edge budget, and deterministic traversal order.
- Queue without capacity: memory can grow with arrival rate minus service rate. Bound queue length and specify reject/defer policy.
- N+1 database queries: measure round trips; batch with explicit upper bounds and parameter limits.

## Algorithm selection gate
Provide a workload fixture, correctness oracle, worst-case input, baseline benchmark, candidate benchmark, peak memory and explanation of changed complexity. No claim of performance improvement without repeatable measurement.
