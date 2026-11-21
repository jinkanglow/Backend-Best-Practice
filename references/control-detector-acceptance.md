# Control Detector Acceptance Contract (v2.5)

## BE-01-02 — domain boundary import

**Required input:** explicit domain roots, forbidden external package prefixes and/or forbidden resolved local directories. No defaults are inferred from a project name.

**Positive evidence:** one parsed module edge from a declared domain root importing a forbidden package or resolved file. Evidence includes source path, specifier, resolved path (if available), import kind, matched rule and SHA-256 of the observation.

**Negative evidence:** no violating edge among parsed edges. This is a limited, scoped pass, not a guarantee of complete architectural separation.

**Unknown:** missing contract, unresolved domain-local import, parse diagnostics or missing graph. Unknown must not be reported as compliance.

**False-positive boundaries:** an external package name must match exactly or at a `/` package subpath boundary. A resolved forbidden path must match a complete directory segment. Files outside domain roots must not be flagged.

**Exclusions:** reflection, runtime dependency injection, dynamic nonliteral imports, generated code not scanned, transitive dependencies, cross-process communication and indirect database use. These require separate controls and evidence.

**Quality gate:** fail=exit 1, unknown/insufficient evidence=exit 2, scoped pass=exit 0. CI must retain the report and exact contract.

**Do not claim:** that this detector fully verifies BE-01-02 in all languages, all frameworks, or all runtime conditions. A registered detector is not the same as independently validated precision/recall.
