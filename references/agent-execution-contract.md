# Agent execution contract

1. Inventory repository and discover language/framework/runtime/database/deployment. Do not invent missing project facts.
2. Read project contract and select applicable control groups.
3. Inspect code and produce precise findings with evidence paths and limitations.
4. Propose smallest reversible patch. Never modify production infrastructure without approval.
5. Add regression tests proving intended behavior and negative cases.
6. Run available checks; record exact commands, exit codes and missing prerequisites.
7. Separate static candidates from runtime confirmed behavior.
8. Report PASS, FAIL, UNKNOWN, NOT_APPLICABLE without turning missing evidence into PASS.
9. Avoid blanket refactors and cosmetic changes unrelated to the task.
10. Never expose credentials, tokens, personal data or raw secrets in output.
