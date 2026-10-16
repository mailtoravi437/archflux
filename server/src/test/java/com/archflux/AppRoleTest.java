package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
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
 * Least-privilege proof (no Spring context): a dedicated non-superuser role
 * gets exactly the roles.sql + V6 grant surface, then runs INSERT / SELECT /
 * UPDATE / DELETE across all 8 tables. The audit trigger must fire under that
 * role (SECURITY DEFINER fix), and RLS {@code SET}-scoped selects must return
 * only the requester's own rows. RLS is genuinely exercised here because the
 * role is neither superuser nor table owner.
 */
class AppRoleTest {

  private static final PostgreSQLContainer<?> DB =
      new PostgreSQLContainer<>("postgres:17-alpine");

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
        Path.of(System.getProperty("user.dir"), "..", "db", "migrations").normalize(),
        Path.of("/Users/ravikumar/archflux/db/migrations"),
    };
    for (Path dir : candidates) {
      if (Files.isDirectory(dir)) {
        return dir;
      }
    }
    throw new IllegalStateException("Could not locate db/migrations from user.dir="
        + System.getProperty("user.dir"));
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

  private static long count(Connection connection, String sql) throws Exception {
    try (Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      rows.next();
      return rows.getLong(1);
    }
  }

  private static String singleString(Connection connection, String sql) throws Exception {
    try (Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      rows.next();
      return rows.getString(1);
    }
  }

  private static String literal(UUID id) {
    return "'" + id + "'";
  }

  @Test
  void leastPrivilegeCrudTriggersAuditAndRlsScopesReads() throws Exception {
    try (Connection owner = DB.createConnection("")) {
      for (String file : List.of("V1__init.sql", "V2__additional_indexes.sql",
          "V3__production_hardening.sql", "V4__oauth_fields.sql",
          "V5__versioning_branching.sql", "V6__workspaces.sql")) {
        exec(owner, Files.readString(migrationDir().resolve(file)));
      }
      exec(owner, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN CREATE ROLE app_tester WITH LOGIN PASSWORD 'tester-pw-123'; END IF; END $$");
      // Grant surface mirroring db/roles.sql (§2 + V6 §3).
      exec(owner, "GRANT USAGE ON SCHEMA public TO app_tester");
      for (String table : List.of("users", "diagrams", "checkpoints", "threads", "replies",
          "sync_log", "workspaces", "workspace_memberships")) {
        exec(owner, "GRANT SELECT, INSERT, UPDATE, DELETE ON public." + table + " TO app_tester");
      }
      exec(owner, "GRANT SELECT, INSERT ON public.audit_log TO app_tester");
      exec(owner, "GRANT USAGE, SELECT ON SEQUENCE public.sync_log_id_seq TO app_tester");
      exec(owner, "GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.provision_user(uuid, text, text, text, text, text, text, text) TO app_tester");
    }

    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID workspaceA = UUID.randomUUID();
    UUID workspaceB = UUID.randomUUID();
    UUID diagramA = UUID.randomUUID();
    UUID diagramB = UUID.randomUUID();
    UUID checkpointA = UUID.randomUUID();
    UUID threadA = UUID.randomUUID();
    UUID threadB = UUID.randomUUID();
    UUID replyA = UUID.randomUUID();

    Properties credentials = new Properties();
    credentials.setProperty("user", "app_tester");
    credentials.setProperty("password", "tester-pw-123");

    try (Connection app = DriverManager.getConnection(DB.getJdbcUrl(), credentials)) {
      // --- Full DML across all 8 tables as the least-privilege role.
      exec(app, "SET app.current_user_id = " + literal(userA));
      exec(app, "SET app.current_user_role = 'admin'");
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userA) + ", 'role-a@archflux.local', 'Role A', 'member', 'email')");
      update(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceA) + ", 'A ws', 'member')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceA) + ", " + literal(userA) + ", 'admin', 'active')");
      update(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
          + literal(diagramA) + ", " + literal(userA) + ", " + literal(workspaceA)
          + ", 'a diagram', '{}', '{}')");
      update(app, "INSERT INTO public.checkpoints (id, diagram_id, title, snapshot) VALUES ("
          + literal(checkpointA) + ", " + literal(diagramA) + ", 'cp', '{}')");
      update(app, "INSERT INTO public.threads (id, diagram_id, author, text) VALUES ("
          + literal(threadA) + ", " + literal(diagramA) + ", 'ann', 'hello')");
      update(app, "INSERT INTO public.replies (id, thread_id, author, text) VALUES ("
          + literal(replyA) + ", " + literal(threadA) + ", 'bob', 'hi')");
      update(app, "INSERT INTO public.sync_log (diagram_id, actor, commit_sha, delta) VALUES ("
          + literal(diagramA) + ", 'dev', 'abc', '{}')");

      // The audit trigger fired under least privilege (SECURITY DEFINER fix).
      for (String table : List.of("users", "diagrams", "checkpoints", "threads", "replies",
          "sync_log")) {
        assertThat(count(app,
            "SELECT COUNT(*) FROM public.audit_log WHERE table_name = '" + table + "'"))
            .as("audit rows for %s", table)
            .isPositive();
      }

      assertThat(update(app, "UPDATE public.diagrams SET title = 'renamed' WHERE id = "
          + literal(diagramA))).isEqualTo(1);
      assertThat(update(app, "DELETE FROM public.replies WHERE id = " + literal(replyA)))
          .isEqualTo(1);

      // SELECT reachability on every table under the app role, plus an
      // UPDATE and DELETE on two more tables. The users count is scoped to
      // this test's fixtures: the shared container may hold rows from the
      // provisioning test (plain JDBC, no rollback).
      assertThat(count(app, "SELECT COUNT(*) FROM public.users WHERE email LIKE 'role-%@archflux.local'")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.checkpoints")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.replies")).isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.sync_log")).isEqualTo(1);
      assertThat(update(app, "UPDATE public.checkpoints SET title = 'cp2' WHERE id = "
          + literal(checkpointA))).isEqualTo(1);
      assertThat(update(app, "DELETE FROM public.sync_log WHERE diagram_id = "
          + literal(diagramA))).isEqualTo(1);

      // Second tenant for the RLS matrix.
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userB) + ", 'role-b@archflux.local', 'Role B', 'member', 'email')");
      exec(app, "SET app.current_user_id = " + literal(userB));
      update(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceB) + ", 'B ws', 'member')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceB) + ", " + literal(userB) + ", 'admin', 'active')");
      update(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
          + literal(diagramB) + ", " + literal(userB) + ", " + literal(workspaceB)
          + ", 'b diagram', '{}', '{}')");
      update(app, "INSERT INTO public.threads (id, diagram_id, author, text) VALUES ("
          + literal(threadB) + ", " + literal(diagramB) + ", 'bob', 'private')");

      // --- RLS-protected selects return only the requester's own rows.
      exec(app, "SET app.current_user_role = 'member'");
      exec(app, "SET app.current_user_id = " + literal(userA));
      assertThat(singleString(app, "SELECT id FROM public.diagrams")).isEqualTo(diagramA.toString());
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams")).isEqualTo(1);
      assertThat(singleString(app, "SELECT id FROM public.workspaces")).isEqualTo(workspaceA.toString());
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspace_memberships")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.threads")).isEqualTo(1);

      exec(app, "SET app.current_user_id = " + literal(userB));
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams")).isEqualTo(1);
      assertThat(singleString(app, "SELECT id FROM public.diagrams")).isEqualTo(diagramB.toString());
      assertThat(singleString(app, "SELECT id FROM public.workspaces")).isEqualTo(workspaceB.toString());

      // No identity set → fail-closed, zero rows (never an error).
      exec(app, "RESET app.current_user_id");
      exec(app, "RESET app.current_user_role");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams")).isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspaces")).isZero();

      // Foreign writes are blocked: UPDATE touches 0 rows, INSERT raises.
      exec(app, "SET app.current_user_id = " + literal(userB));
      exec(app, "SET app.current_user_role = 'member'");
      assertThat(update(app, "UPDATE public.diagrams SET title = 'hijack' WHERE id = "
          + literal(diagramA))).isZero();
      UUID evil = UUID.randomUUID();
      assertThatThrownBy(() -> update(app,
          "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
              + literal(evil) + ", " + literal(userA) + ", " + literal(workspaceA)
              + ", 'evil', '{}', '{}')"))
          .hasMessageContaining("row-level security");
    }
  }

  @Test
  void provisionUserFunctionProvisionsLoginUnderAppRole() throws Exception {
    try (Connection owner = DB.createConnection("")) {
      for (String file : List.of("V1__init.sql", "V2__additional_indexes.sql",
          "V3__production_hardening.sql", "V4__oauth_fields.sql",
          "V5__versioning_branching.sql", "V6__workspaces.sql")) {
        exec(owner, Files.readString(migrationDir().resolve(file)));
      }
      exec(owner, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN CREATE ROLE app_tester WITH LOGIN PASSWORD 'tester-pw-123'; END IF; END $$");
      exec(owner, "GRANT USAGE ON SCHEMA public TO app_tester");
      exec(owner, "GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO app_tester");
      exec(owner, "GRANT SELECT ON public.workspaces TO app_tester");
      exec(owner, "GRANT SELECT ON public.workspace_memberships TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.provision_user(uuid, text, text, text, text, text, text, text) TO app_tester");
    }

    Properties credentials = new Properties();
    credentials.setProperty("user", "app_tester");
    credentials.setProperty("password", "tester-pw-123");

    // Login paths run with no RequestUser/GUC and users_modify_admin denies
    // user-row writes to non-admins — so the app role must provision through
    // the SECURITY DEFINER function, never direct DML. Direct INSERT proves
    // the denial; the function proves the path.
    try (Connection app = DriverManager.getConnection(DB.getJdbcUrl(), credentials)) {
      UUID sub = UUID.randomUUID();
      assertThatThrownBy(() -> update(app,
          "INSERT INTO public.users (id, email, name, role) VALUES ("
              + literal(sub) + ", 'login@archflux.local', 'Login', 'member')"))
          .hasMessageContaining("row-level security");

      String freshId = singleString(app,
          "SELECT public.provision_user(" + literal(sub)
              + ", 'login@archflux.local', 'Login', 'member', 'email', 'login@archflux.local', NULL, NULL)");
      assertThat(freshId).isEqualTo(sub.toString());
      assertThat(count(app, "SELECT COUNT(*) FROM public.users WHERE email = 'login@archflux.local'"))
          .isEqualTo(1);
      // Personal workspace + admin membership backstop ran inside the function.
      exec(app, "SET app.current_user_id = " + literal(sub));
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspaces")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspace_memberships")).isEqualTo(1);

      // Second login is idempotent: same id, no duplicate workspace.
      String again = singleString(app,
          "SELECT public.provision_user(" + literal(UUID.randomUUID())
              + ", 'login@archflux.local', 'Login', 'member', 'email', 'login@archflux.local', NULL, NULL)");
      assertThat(again).isEqualTo(sub.toString());
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspaces")).isEqualTo(1);

      // NULL email is rejected, never a half-provisioned row.
      assertThatThrownBy(() -> singleString(app,
          "SELECT public.provision_user(" + literal(UUID.randomUUID()) + ", NULL, NULL, NULL, NULL, NULL, NULL, NULL)"))
          .hasMessageContaining("email is required");
    }
  }
}
