# Architecture characteristics and fitness tests

## Choose by constraint, not preference
Record business capability ownership, deployment independence requirement, data consistency boundary, team operational capacity and latency budget. A modular monolith is the default evaluation baseline; independent services require documented benefits exceeding distributed coordination and failure costs. This is a decision heuristic, not a universal requirement.

## Fitness contracts
- Dependency direction: domain packages must not import transport, ORM or cloud SDK packages; validate resolved module graph.
- Cycles: identify strongly connected components; cycles of size >1 are actionable only if prohibited by the project boundary contract.
- Deployability: one version change must not require coordinated release unless documented. Verify with a versioned contract test.
- Resilience: prove timeout and retry budgets with injected latency and unavailable downstream.
- Data ownership: one service owns writes to each authoritative record; cross-service consistency requires explicit events or orchestration.

## Decision record
Capture context, alternatives, selected option, measurable consequences, reversal cost, date and review trigger. Do not present a tradeoff as a fact without measured evidence.
