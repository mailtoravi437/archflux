package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * PROD-005 upgrade path (no Spring context): applies V1..V6 via plain JDBC on
 * a scratch PostgreSQL 17, seeds a user + workspace + diagram, applies V7,
 * asserts the backfill revision + version default + RLS/grants shape, then
 * applies V7 AGAIN to prove re-runnability. A least-privilege role proves
 * revisions are SELECT-scoped, INSERT-open, and UPDATE/DELETE-denied (RLS
 * immutability), mirroring the AppRoleTest pattern.
 */
class V7UpgradeTest {

  private static final PostgreSQLContainer<?> DB =
      new PostgreSQLContainer<>("postgres:17-alpine");

  private static final List<String> PRE_V7 = List.of("V1__init.sql",
      "V2__additional_indexes.sql", "V3__production_hardening.sql",
      "V4__oauth_fields.sql", "V5__versioning_branching.sql", "V6__workspaces.sql");

  @BeforeAll
  static void start() {
    ensureDockerHost();
    DB.start();
  }

  @AfterAll
  static void stop() {
    DB.stop();
  }

  static void ensureDockerHost() {
    String envHost = System.getenv("DOCKER_HOST");
    if (envHost != null && !envHost.isBlank()) {
      return;
    }
    if (System.getProperty("docker.host") != null && !System.getProperty("docker.host").isBlank()) {
      return;
    }
    String home = System.getProperty("user.home", "");
    String[] candidates = {
        home + "/.colima/default/docker.sock",
        home + "/.docker/run/docker.sock",
        "/var/run/docker.sock",
    };
    for (String candidate : candidates) {
      if (Files.exists(Path.of(candidate))) {
        System.setProperty("docker.host", "unix://" + candidate);
        return;
      }
    }
  }

  private static Path migrationDir() {
    Path[] candidates = {
          MigrationFiles.dir(),
      };
    for (Path dir : candidates) {
      if (Files.isDirectory(dir)) {
        return dir;
      }
    }
    throw new IllegalStateException("Could not locate db/migration (classpath) from user.dir="
        + System.getProperty("user.dir"));
  }

  private static void apply(Connection connection, String file) throws Exception {
    String sql = Files.readString(migrationDir().resolve(file));
    try (Statement statement = connection.createStatement()) {
      // pgjdbc simple-query protocol runs the whole script, DO blocks included.
      statement.execute(sql);
    }
  }

  private static long count(Connection connection, String sql) throws Exception {
    try (Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      rows.next();
      return rows.getLong(1);
    }
  }

  private static String literal(UUID id) {
    return "'" + id + "'";
  }

  private static void exec(Connection connection, String sql) throws Exception {
    try (Statement statement = connection.createStatement()) {
      statement.execute(sql);
    }
  }

  private static int update(Connection connection, String sql) throws Exception {
    try (Statement statement = connection.createStatement()) {
      return statement.executeUpdate(sql);
    }
  }

  @Test
  void upgradeBackfillsRevisionsAndIsRerunnable() throws Exception {
    UUID user = UUID.randomUUID();
    UUID workspace = UUID.randomUUID();
    UUID diagram = UUID.randomUUID();

    try (Connection admin = DB.createConnection("")) {
      // Pre-create the app role so the V7 role-guarded grants actually apply,
      // then prove them via has_table_privilege below.
      exec(admin, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'archflux_app') "
          + "THEN CREATE ROLE archflux_app WITH LOGIN PASSWORD 'v7-app-pw'; END IF; END $$");
      exec(admin, "GRANT USAGE ON SCHEMA public TO archflux_app");

      for (String file : PRE_V7) {
        apply(admin, file);
      }

      try (PreparedStatement insertUser = admin.prepareStatement(
          "INSERT INTO public.users (id, email, name, role, provider) VALUES (?, ?, ?, ?, ?)")) {
        insertUser.setObject(1, user);
        insertUser.setString(2, "v7-alice@archflux.local");
        insertUser.setString(3, "Alice");
        insertUser.setString(4, "member");
        insertUser.setString(5, "email");
        insertUser.executeUpdate();
      }
      exec(admin, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspace) + ", 'V7 ws', 'member')");
      exec(admin, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspace) + ", " + literal(user) + ", 'admin', 'active')");
      exec(admin, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
          + literal(diagram) + ", " + literal(user) + ", " + literal(workspace)
          + ", 'v7 diagram', '{}', '{\"nodes\":[]}')");

      apply(admin, "V7__phase2_integrity.sql");
      assertV7Shape(admin, user, diagram);

      // Re-apply proves re-runnability; the backfill stays a no-op (scoped to
      // this test's diagram — the container is shared with the RLS test).
      apply(admin, "V7__phase2_integrity.sql");
      assertThat(count(admin, "SELECT COUNT(*) FROM public.diagram_revisions WHERE diagram_id = '"
          + diagram + "'")).isEqualTo(1);
      assertV7Shape(admin, user, diagram);
    }
  }

  private void assertV7Shape(Connection admin, UUID user, UUID diagram) throws Exception {
    // Backfill: exactly one revision, parent NULL, 64-hex sha256, backfill
    // source, author = owner, snapshot mirrors the graph.
    try (Statement statement = admin.createStatement();
        ResultSet rows = statement.executeQuery(
            "SELECT parent_revision_id, content_hash, snapshot, author_id, source, message "
                + "FROM public.diagram_revisions WHERE diagram_id = '" + diagram + "'")) {
      assertThat(rows.next()).isTrue();
      assertThat(rows.getObject(1)).isNull();
      assertThat(rows.getString(2)).matches("[0-9a-f]{64}");
      // jsonb normalizes whitespace on storage; compare against the stored
      // graph text rather than the input literal.
      assertThat(rows.getString(3)).isEqualTo("{\"nodes\": []}");
      assertThat(rows.getObject(4).toString()).isEqualTo(user.toString());
      assertThat(rows.getString(5)).isEqualTo("backfill");
      assertThat(rows.getString(6)).isNull();
      assertThat(rows.next()).isFalse();
    }

    // diagrams.version defaults to 1 and is NOT NULL.
    try (Statement statement = admin.createStatement();
        ResultSet rows = statement.executeQuery(
            "SELECT version, is_nullable FROM public.diagrams d "
                + "JOIN information_schema.columns c ON c.table_schema = 'public' "
                + "AND c.table_name = 'diagrams' AND c.column_name = 'version' "
                + "WHERE d.id = '" + diagram + "'")) {
      assertThat(rows.next()).isTrue();
      assertThat(rows.getLong(1)).isEqualTo(1L);
      assertThat(rows.getString(2)).isEqualTo("NO");
    }

    // Tables, constraints, indexes.
    for (String table : List.of("diagram_revisions", "webhook_events",
        "idempotency_keys", "audit_events")) {
      assertThat(count(admin,
          "SELECT COUNT(*) FROM pg_class WHERE relname = '" + table + "'"))
          .as("table %s", table).isEqualTo(1);
    }
    for (String constraint : List.of("fk_revisions_diagram", "fk_revisions_parent",
        "uq_webhook_delivery", "chk_revisions_source", "chk_webhook_status",
        "chk_audit_outcome")) {
      assertThat(count(admin,
          "SELECT COUNT(*) FROM pg_constraint WHERE conname = '" + constraint + "'"))
          .as("constraint %s", constraint).isEqualTo(1);
    }
    for (String index : List.of("idx_revisions_diagram", "idx_revisions_hash",
        "idx_webhook_status", "idx_idem_expires", "idx_audit_ws", "idx_audit_actor")) {
      assertThat(count(admin,
          "SELECT COUNT(*) FROM pg_class WHERE relname = '" + index + "'"))
          .as("index %s", index).isEqualTo(1);
    }

    // RLS enabled on all four; exactly the five expected policies.
    assertThat(count(admin,
        "SELECT COUNT(*) FROM pg_class WHERE relname IN ('diagram_revisions', "
            + "'webhook_events', 'idempotency_keys', 'audit_events') "
            + "AND relrowsecurity = true")).isEqualTo(4);
    assertThat(count(admin,
        "SELECT COUNT(*) FROM pg_policy WHERE polname IN ('revisions_member_select', "
            + "'revisions_insert_bootstrap', 'webhook_events_app_all', "
            + "'idempotency_keys_app_all', 'audit_events_app_all')")).isEqualTo(5);

    // App-role grants landed (role pre-created above).
    for (String table : List.of("diagram_revisions", "webhook_events",
        "idempotency_keys", "audit_events")) {
      assertThat(count(admin, "SELECT COUNT(*) FROM (SELECT has_table_privilege('archflux_app', "
          + "'public." + table + "', 'SELECT, INSERT, UPDATE, DELETE') AS ok) t WHERE ok"))
          .as("app DML on %s", table).isEqualTo(1);
    }
    for (String seq : List.of("webhook_events_id_seq", "audit_events_id_seq")) {
      assertThat(count(admin, "SELECT COUNT(*) FROM (SELECT has_sequence_privilege('archflux_app', "
          + "'public." + seq + "', 'USAGE, SELECT') AS ok) t WHERE ok"))
          .as("app sequence use on %s", seq).isEqualTo(1);
    }

    // Durable dedup + CHECK surfaces reject duplicates and junk.
    exec(admin, "INSERT INTO public.webhook_events (provider, delivery_id) VALUES ('github', 'dup-1')");
    assertThatThrownBy(() -> exec(admin,
        "INSERT INTO public.webhook_events (provider, delivery_id) VALUES ('github', 'dup-1')"))
        .hasMessageContaining("uq_webhook_delivery");
    exec(admin, "DELETE FROM public.webhook_events WHERE delivery_id = 'dup-1'");
    assertThatThrownBy(() -> exec(admin,
        "INSERT INTO public.webhook_events (delivery_id, status) VALUES ('junk-1', 'bogus')"))
        .hasMessageContaining("chk_webhook_status");
    assertThatThrownBy(() -> exec(admin,
        "INSERT INTO public.audit_events (action, outcome) VALUES ('login', 'bogus')"))
        .hasMessageContaining("chk_audit_outcome");
    assertThatThrownBy(() -> exec(admin,
        "INSERT INTO public.diagram_revisions (diagram_id, content_hash, source) VALUES ("
            + literal(diagram) + ", 'abc', 'bogus')"))
        .hasMessageContaining("chk_revisions_source");
  }

  @Test
  void revisionsAreImmutableAndSelectScopedUnderLeastPrivilege() throws Exception {
    try (Connection owner = DB.createConnection("")) {
      for (String file : PRE_V7) {
        apply(owner, file);
      }
      apply(owner, "V7__phase2_integrity.sql");
      exec(owner, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v7_tester') "
          + "THEN CREATE ROLE v7_tester WITH LOGIN PASSWORD 'v7-tester-pw'; END IF; END $$");
      exec(owner, "GRANT USAGE ON SCHEMA public TO v7_tester");
      for (String table : List.of("users", "diagrams", "workspaces", "workspace_memberships",
          "diagram_revisions", "webhook_events", "idempotency_keys", "audit_events")) {
        exec(owner, "GRANT SELECT, INSERT, UPDATE, DELETE ON public." + table + " TO v7_tester");
      }
      exec(owner, "GRANT USAGE, SELECT ON SEQUENCE public.webhook_events_id_seq TO v7_tester");
      exec(owner, "GRANT USAGE, SELECT ON SEQUENCE public.audit_events_id_seq TO v7_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO v7_tester");
    }

    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID workspaceA = UUID.randomUUID();
    UUID workspaceB = UUID.randomUUID();
    UUID diagramA = UUID.randomUUID();
    UUID diagramB = UUID.randomUUID();

    Properties credentials = new Properties();
    credentials.setProperty("user", "v7_tester");
    credentials.setProperty("password", "v7-tester-pw");

    try (Connection app = DriverManager.getConnection(DB.getJdbcUrl(), credentials)) {
      // Two tenants, each with a diagram. users DML needs the admin role GUC
      // (users_modify_admin, same as AppRoleTest); workspace/diagram/revision
      // writes are membership-authorized.
      exec(app, "SET app.current_user_role = 'admin'");
      exec(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userA) + ", 'v7-a@archflux.local', 'A', 'member', 'email')");
      exec(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userB) + ", 'v7-b@archflux.local', 'B', 'member', 'email')");
      exec(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceA) + ", 'A ws', 'member')");
      exec(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceB) + ", 'B ws', 'member')");
      exec(app, "SET app.current_user_id = " + literal(userA));
      exec(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceA) + ", " + literal(userA) + ", 'admin', 'active')");
      exec(app, "SET app.current_user_id = " + literal(userB));
      exec(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceB) + ", " + literal(userB) + ", 'admin', 'active')");
      exec(app, "SET app.current_user_id = " + literal(userA));
      exec(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
          + literal(diagramA) + ", " + literal(userA) + ", " + literal(workspaceA)
          + ", 'a', '{}', '{}')");
      exec(app, "SET app.current_user_id = " + literal(userB));
      exec(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
          + literal(diagramB) + ", " + literal(userB) + ", " + literal(workspaceB)
          + ", 'b', '{}', '{}')");

      // INSERT is open to the app role (bootstrap policy): one revision each.
      exec(app, "INSERT INTO public.diagram_revisions (diagram_id, content_hash, author_id) VALUES ("
          + literal(diagramA) + ", 'aa', " + literal(userA) + ")");
      exec(app, "INSERT INTO public.diagram_revisions (diagram_id, content_hash, author_id) VALUES ("
          + literal(diagramB) + ", 'bb', " + literal(userB) + ")");

      // SELECT is membership-scoped: each tenant sees only their own revision.
      exec(app, "SET app.current_user_role = 'member'");
      exec(app, "SET app.current_user_id = " + literal(userA));
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_revisions")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_revisions WHERE diagram_id = "
          + literal(diagramA))).isEqualTo(1);
      exec(app, "SET app.current_user_id = " + literal(userB));
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_revisions")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_revisions WHERE diagram_id = "
          + literal(diagramB))).isEqualTo(1);

      // No identity → fail-closed, zero rows.
      exec(app, "RESET app.current_user_id");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_revisions")).isZero();

      // UPDATE and DELETE have no policy: with no USING expression no rows
      // are visible to the write, so both touch 0 rows and the stored
      // revision is unchanged (immutability enforced at the database — the
      // services layer must treat a 0-row write as a conflict, never a
      // silent success).
      exec(app, "SET app.current_user_id = " + literal(userA));
      assertThat(update(app,
          "UPDATE public.diagram_revisions SET message = 'rewrite' WHERE diagram_id = "
              + literal(diagramA))).isZero();
      assertThat(update(app,
          "DELETE FROM public.diagram_revisions WHERE diagram_id = " + literal(diagramA)))
          .isZero();
      assertThat(count(app,
          "SELECT COUNT(*) FROM public.diagram_revisions WHERE diagram_id = "
              + literal(diagramA) + " AND message IS NULL")).isEqualTo(1);

      // Service-owned tables stay fully writable/readable for the app role.
      assertThat(update(app,
          "INSERT INTO public.webhook_events (provider, delivery_id) VALUES ('github', 'v7-del-1')"))
          .isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.webhook_events")).isEqualTo(1);
      assertThat(update(app, "UPDATE public.webhook_events SET status = 'processed' "
          + "WHERE delivery_id = 'v7-del-1'")).isEqualTo(1);
    }
  }
}
