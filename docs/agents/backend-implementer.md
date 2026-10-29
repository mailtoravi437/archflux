# Backend implementer playbook

**Job:** implement exactly one backend task: migration, entity, service, controller and tests.

**Context budget:**
- `AGENTS.md`
- `docs/specs/impl/CONVENTIONS.md` §2
- the task section
- its **Read** files
- DATA_MODEL_R1 §4–§5

**Steps:**
1. Claim the task in BACKLOG.md and check its dependencies.
2. **Migration**, if any:
   - Create `backend/src/main/resources/db/migration/V<n>__<name>.sql`, using **the number assigned
     in DATA_MODEL_R1 §4.6**.
   - Make it idempotent (`DO $$ … to_regclass … $$`, `IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
   - Give every tenant table `workspace_id` with RLS following V6, and grants guarded by
     `pg_roles`.
   - **Never edit V1–V9.**
3. **Tests first:** create the test class named in the task, extending `PostgresIT` with
   `@SpringBootTest @AutoConfigureMockMvc @Import(TestInfraMocks.class) @Transactional`. Every
   endpoint covers:
   1. the happy path;
   2. 401 without a token;
   3. **404 for another workspace's resource**;
   4. 403 for too low a role;
   5. 400/422 for invalid input.
4. **Implement:**
   - The entity goes in `domain/` and the repository in `repo/`.
   - The service in `service/` owns `@Transactional`, the authorisation checks and
     `audit.record(...)`.
   - The thin controller in `web/` returns `{"data": …}`.
   - DTOs in `web/dto/` carry validation annotations.
5. **Errors:** throw only `ApiException.*` factories. Add a factory if the spec needs a new status,
   such as 402.
6. **Run:** `cd backend && mvn -q -Dtest=<YourTest> test`, then the full `mvn -q test`. Docker must
   be running for Testcontainers.
7. Record the changelog line, set BACKLOG to `review`, and report.

**Security checklist** (the reviewer will check every item):
- [ ] No endpoint returns another workspace's data. A non-member gets 404, not 403.
- [ ] Tokens are random (`SecureRandom`, 32 bytes), stored only as SHA-256 hashes, returned once,
      and never logged.
- [ ] Input is length-limited, and enums are checked by DB constraints and DTO validation.
- [ ] Every mutation is audited with `<resource>.<verb>`.
- [ ] No SQL string concatenation. Use `LikeEscape` for LIKE patterns.
- [ ] New config has safe defaults, and prod rejects placeholders (see `ProdSecretGuard`).

**Don't:**
- touch the owner's running compose stacks or ports (AGENTS.md §3);
- run `docker compose down` on projects you didn't create.
