# Evidence quality and decision rules

## Four statuses
`pass`: executed assertion demonstrates the exact control within the declared environment and scope. `fail`: observed counterexample violates the control. `unknown`: not executed, unsupported, missing artifact or insufficient scope. `not_applicable`: reviewed exclusion with specific reason.

## Proof chain
Control ID → invariant → executable assertion → pinned environment → observed state → artifact digest → trusted runner signature → independent verifier decision. Each link is necessary for strong evidence; a signature cannot prove that the assertion was valid.

## Acceptance checklist
Require test ID, control ID, target commit, runtime and DB versions, fixture seed, exact command, exit code, expected/actual state, time, SHA-256 artifact digest, runner identity, and explicit exclusions. A reviewer must inspect assertion semantics.

## Evidence rejection
Reject arbitrary manual pass flags as automated proof, missing negative cases for authorization, missing durable-state check for idempotency, mismatched commit, expired runner attestation, unknown environment, or self-signed reports from an untrusted runner.
