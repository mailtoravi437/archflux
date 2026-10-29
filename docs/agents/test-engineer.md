# Test engineer playbook

**Job:** write or strengthen tests. You **never** change product code. If a test reveals a bug,
record it as `R1-BUG-nn` in BACKLOG with the failing test name.

**Inputs:** a gate task (EPIC-13), or "add missing tests for R1-Exx-Tyy".

**Steps:**
1. Read the task's **Tests** and **Acceptance** sections, plus the code under test. Read only that.
2. Choose the level:
   - pure logic → vitest unit tests (`src/tests/*.test.ts`);
   - component behaviour → Testing Library (`*.test.tsx`);
   - full journeys → Playwright (`e2e/*.spec.ts`);
   - backend → MockMvc integration tests extending `PostgresIT`.
3. Each test asserts **observable behaviour**: role and name queries, recorded canvas calls, HTTP
   status and body. It doesn't assert implementation details.
4. Put fixtures in `src/tests/fixtures/` or `e2e/fixtures.ts`, never in product code
   (`no-mock-data.test.tsx`).
5. **Playwright:**
   - use dev-server ports 5191+;
   - run the backend as compose project `archflux-qa` on 28080/23001;
   - never use the owner's 5173/3001/8080 stacks.
6. **Visual snapshots:** never update them without a human's approval recorded in the epic
   changelog.

**Output:** the test files, the run command with its results, and any `R1-BUG-nn` rows added.
