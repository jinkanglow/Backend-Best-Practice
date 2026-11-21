# SQL Query Correctness and Cost — Execution Contract

## Required query contract
For every newly introduced production query record: input types; null/missing-value semantics; expected row cardinality; uniqueness assumptions; join key cardinality; ordering guarantees; pagination behavior; transaction isolation; maximum data volume; and an actual query plan on the target database engine.

## Query correctness gates
1. JOIN cardinality: construct fixtures with zero, one and multiple matches. Assert row count and key uniqueness. Never assume a JOIN preserves cardinality without checking the key relationship.
2. NULL: test `IS NULL`, three-valued predicates, `NOT IN` with NULL, aggregate handling and nullable join keys. Do not use `= NULL`.
3. Aggregation: test groups with no rows, one row, duplicates, and nullable values. Explicitly distinguish COUNT(*) from COUNT(column).
4. Updates: use explicit predicates, transaction boundaries, row-count assertions and rollback evidence. Prohibit an unreviewed unbounded UPDATE or DELETE in a production migration.
5. Parameter binding: supply SQL values through the driver's bind mechanism; never interpolate untrusted values into SQL text. Identifiers require an explicit allowlist; value parameters do not make arbitrary identifiers safe.
6. Pagination: require stable ordering with a unique tie-breaker; test insertions/deletions between pages when consistency matters.

## Query performance gates
- Capture EXPLAIN (and EXPLAIN ANALYZE only in safe, isolated environments), database version, index definitions, representative table statistics, cardinality and elapsed-time distribution.
- Investigate full scans, large sorts, row-estimate divergence, repeated correlated subqueries, N+1 query patterns and missing composite-index prefixes. None is automatically a defect: compare to measured cost and workload.
- Record p50/p95/p99 latency under an explicit concurrency level, data scale and warm/cold cache conditions. A query plan is evidence of a chosen plan, not proof of production performance.
- Set statement timeouts and connection pool budgets; confirm query cancellation actually terminates database work.

## Evidence requirements
Each claim must include test engine and version, migration/schema hash, SQL fingerprint (never parameter values or credentials), fixture seed, assertions, execution ID, observed outcome and missing evidence. SQLite is not a substitute for PostgreSQL/MySQL isolation, locking or planner validation.

## Reject conditions
- No target-engine execution for an engine-specific performance or locking claim.
- A passing test without asserted cardinality or state change.
- A SQL query constructed by concatenating untrusted input.
- No negative fixtures for null and duplicate keys when applicable.
