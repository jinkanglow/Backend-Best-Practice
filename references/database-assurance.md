# Database assurance execution contract

1. Use an isolated, disposable PostgreSQL/MySQL database owned by the test runner. Never point the connection variable at production or shared staging.
2. Database test execution requires both `BACKEND_GUARD_ALLOW_DB_TESTS=yes` and the test's `allow_mutation_on_test_database: true`. These are acknowledgements, **not** proof that the target is isolated.
3. SQL files and query assertions are user-supplied executable SQL. Review them before execution. The plugin does not sandbox database SQL or limit SQL privileges.
4. Connect with a least-privilege test account. Set database-level statement and lock timeouts separately.
5. PostgreSQL and MySQL adapters use optional external drivers (`pg` and `mysql2`). Drivers must be installed in the consuming project.
6. `transaction_sql` begins a transaction, executes supplied statements, and either commits or injects `ROLLBACK` before commit. Postcondition assertions are performed after the transaction. It does not simulate power loss, a network partition, or an in-doubt commit.
7. `postgres_migration` / `mysql_migration` execute files directly. No automatic rollback, transactional DDL guarantee, schema diff, downgrade or lock-safety verification is implied.
8. Every control remains `unknown` on a passing test. A failing test can make the linked control `fail`; a passing observation alone cannot establish a universal control guarantee.
