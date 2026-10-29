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

  /**
   * The container is shared: once any test has applied V11, its policies on
   * diagrams/threads/replies/checkpoints call the V11 helpers, so every role
   * touching those tables needs EXECUTE on them (archflux_app gets it in V11).
   */
  private static void grantV11Helpers(Connection owner, String role) throws Exception {
    exec(owner, "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_diagram') THEN "
        + "GRANT EXECUTE ON FUNCTION public.can_access_diagram(uuid, uuid) TO " + role + "; "
        + "GRANT EXECUTE ON FUNCTION public.share_link_role(uuid, text) TO " + role + "; "
        + "GRANT EXECUTE ON FUNCTION public.resolve_share_token(text) TO " + role + "; "
        + "GRANT EXECUTE ON FUNCTION public.diagram_request_info(uuid) TO " + role + "; "
        + "GRANT EXECUTE ON FUNCTION public.diagram_owner_contacts(uuid) TO " + role + "; "
        + "GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO " + role + "; "
        + "GRANT EXECUTE ON FUNCTION public.workspace_role_at_least(uuid, uuid, text) TO " + role + "; "
        + "END IF; "
        // V12/V18: the workspaces invitee-read policy calls these helpers.
        + "IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_pending_workspace_invite') THEN "
        + "GRANT EXECUTE ON FUNCTION public.has_pending_workspace_invite(uuid) TO " + role + "; "
        + "GRANT EXECUTE ON FUNCTION public.current_user_email() TO " + role + "; "
        + "END IF; END $$");
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
      grantV11Helpers(owner, "app_tester");
      // Grant execute on V15 helper function (needed by V15 policies)
      exec(owner, "GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO app_tester");
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
      grantV11Helpers(owner, "app_tester");
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

  /**
   * R1-E06-T01 (V10): under the least-privilege role, folders and stars are
   * tenant-scoped by RLS, members can soft-delete and still see trashed
   * rows, and the GUC-less purge function works for the scheduler.
   */
  @Test
  void v10FoldersAreWorkspaceScopedUnderAppRole() throws Exception {
    try (Connection owner = DB.createConnection("")) {
      List<String> files;
      try (var stream = Files.list(migrationDir())) {
        files = stream.map(p -> p.getFileName().toString())
            .filter(n -> n.matches("V\\d+__.*\\.sql"))
            .sorted(MigrationFiles.BY_VERSION)
            .toList();
      }
      assertThat(files).contains("V10__folders_trash.sql");
      for (String file : files) {
        exec(owner, Files.readString(migrationDir().resolve(file)));
      }
      exec(owner, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN CREATE ROLE app_tester WITH LOGIN PASSWORD 'tester-pw-123'; END IF; END $$");
      exec(owner, "GRANT USAGE ON SCHEMA public TO app_tester");
      for (String table : List.of("users", "diagrams", "workspaces", "workspace_memberships",
          "folders", "diagram_stars", "diagram_revisions")) {
        exec(owner, "GRANT SELECT, INSERT, UPDATE, DELETE ON public." + table + " TO app_tester");
      }
      exec(owner, "GRANT SELECT, INSERT ON public.audit_log TO app_tester");
      exec(owner, "GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.purge_expired_trash(timestamptz, integer) TO app_tester");
      grantV11Helpers(owner, "app_tester");
    }

    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID workspaceA = UUID.randomUUID();
    UUID workspaceB = UUID.randomUUID();
    UUID folderA = UUID.randomUUID();
    UUID diagramA = UUID.randomUUID();
    UUID expiredA = UUID.randomUUID();

    Properties credentials = new Properties();
    credentials.setProperty("user", "app_tester");
    credentials.setProperty("password", "tester-pw-123");

    try (Connection app = DriverManager.getConnection(DB.getJdbcUrl(), credentials)) {
      exec(app, "SET app.current_user_role = 'admin'");
      exec(app, "SET app.current_user_id = " + literal(userA));
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userA) + ", 'v10-a-" + userA + "@archflux.local', 'V10 A', 'member', 'email')");
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userB) + ", 'v10-b-" + userB + "@archflux.local', 'V10 B', 'member', 'email')");
      update(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceA) + ", 'V10 A ws', 'member')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceA) + ", " + literal(userA) + ", 'admin', 'active')");
      update(app, "INSERT INTO public.folders (id, workspace_id, name, created_by) VALUES ("
          + literal(folderA) + ", " + literal(workspaceA) + ", 'Platform', " + literal(userA) + ")");
      update(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, folder_id, title, tags, graph) VALUES ("
          + literal(diagramA) + ", " + literal(userA) + ", " + literal(workspaceA) + ", "
          + literal(folderA) + ", 'v10 diagram', '{}', '{}')");
      update(app, "INSERT INTO public.diagram_stars (user_id, diagram_id) VALUES ("
          + literal(userA) + ", " + literal(diagramA) + ")");

      // Soft delete under the app role: allowed, and the trashed row stays visible.
      assertThat(update(app, "UPDATE public.diagrams SET deleted_at = now() WHERE id = "
          + literal(diagramA))).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams WHERE id = "
          + literal(diagramA) + " AND deleted_at IS NOT NULL")).isEqualTo(1);
      assertThat(update(app, "UPDATE public.diagrams SET deleted_at = NULL WHERE id = "
          + literal(diagramA))).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.folders")).isEqualTo(1);

      // Workspace B: cannot read, change or plant folders/stars in A.
      exec(app, "SET app.current_user_id = " + literal(userB));
      update(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceB) + ", 'V10 B ws', 'member')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceB) + ", " + literal(userB) + ", 'admin', 'active')");
      exec(app, "SET app.current_user_role = 'member'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.folders")).isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_stars")).isZero();
      assertThat(update(app, "UPDATE public.folders SET name = 'hijack' WHERE id = "
          + literal(folderA))).isZero();
      assertThat(update(app, "UPDATE public.diagrams SET deleted_at = now() WHERE id = "
          + literal(diagramA))).isZero();
      assertThatThrownBy(() -> update(app,
          "INSERT INTO public.folders (workspace_id, name) VALUES (" + literal(workspaceA)
              + ", 'planted')"))
          .hasMessageContaining("row-level security");
      assertThatThrownBy(() -> update(app,
          "INSERT INTO public.diagram_stars (user_id, diagram_id) VALUES (" + literal(userA)
              + ", " + literal(diagramA) + ")"))
          .hasMessageContaining("row-level security");

      // Purge runs with no request identity (scheduler) and removes only expired rows.
      exec(app, "SET app.current_user_id = " + literal(userA));
      update(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph, deleted_at) VALUES ("
          + literal(expiredA) + ", " + literal(userA) + ", " + literal(workspaceA)
          + ", 'expired', '{}', '{}', now() - interval '31 days')");
      exec(app, "RESET app.current_user_id");
      exec(app, "RESET app.current_user_role");
      assertThat(count(app, "SELECT COUNT(*) FROM public.purge_expired_trash(now(), 100) "
          + "WHERE r_id = " + literal(expiredA))).isEqualTo(1);
      exec(app, "SET app.current_user_id = " + literal(userA));
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams WHERE id IN ("
          + literal(expiredA) + ", " + literal(diagramA) + ")")).isEqualTo(1);
    }
  }

  /**
   * R1-E07-T01/T03 (V11): under the least-privilege role the sharing tables
   * are tenant-scoped, a share-link hash published in app.share_token_hash
   * reads exactly one live diagram (and its threads) with no user identity,
   * and links never allow writes beyond a commenter's thread.
   */
  @Test
  void v11SharingIsScopedAndLinksReadOnlyUnderAppRole() throws Exception {
    try (Connection owner = DB.createConnection("")) {
      List<String> files;
      try (var stream = Files.list(migrationDir())) {
        files = stream.map(p -> p.getFileName().toString())
            .filter(n -> n.matches("V\\d+__.*\\.sql"))
            .sorted(MigrationFiles.BY_VERSION)
            .toList();
      }
      assertThat(files).contains("V11__sharing.sql");
      for (String file : files) {
        exec(owner, Files.readString(migrationDir().resolve(file)));
      }
      exec(owner, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN CREATE ROLE app_tester WITH LOGIN PASSWORD 'tester-pw-123'; END IF; END $$");
      exec(owner, "GRANT USAGE ON SCHEMA public TO app_tester");
      for (String table : List.of("users", "diagrams", "workspaces", "workspace_memberships",
          "threads", "replies", "checkpoints", "diagram_members", "share_links",
          "access_requests", "diagram_revisions")) {
        exec(owner, "GRANT SELECT, INSERT, UPDATE, DELETE ON public." + table + " TO app_tester");
      }
      exec(owner, "GRANT SELECT, INSERT ON public.audit_log TO app_tester");
      exec(owner, "GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO app_tester");
      grantV11Helpers(owner, "app_tester");
      // Grant execute on V15 helper function
      exec(owner, "GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO app_tester");
      // Re-applying V11 is a no-op (idempotent).
      exec(owner, Files.readString(migrationDir().resolve("V11__sharing.sql")));
    }

    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID workspaceA = UUID.randomUUID();
    UUID workspaceB = UUID.randomUUID();
    UUID diagramA = UUID.randomUUID();
    UUID otherA = UUID.randomUUID();
    UUID threadA = UUID.randomUUID();
    String anyoneHash = "a".repeat(64);
    String workspaceHash = "b".repeat(64);

    Properties credentials = new Properties();
    credentials.setProperty("user", "app_tester");
    credentials.setProperty("password", "tester-pw-123");

    try (Connection app = DriverManager.getConnection(DB.getJdbcUrl(), credentials)) {
      exec(app, "SET app.current_user_role = 'admin'");
      exec(app, "SET app.current_user_id = " + literal(userA));
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userA) + ", 'v11-a-" + userA + "@archflux.local', 'V11 A', 'member', 'email')");
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userB) + ", 'v11-b-" + userB + "@archflux.local', 'V11 B', 'member', 'email')");
      update(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceA) + ", 'V11 A ws', 'member')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceA) + ", " + literal(userA) + ", 'admin', 'active')");
      for (UUID d : List.of(diagramA, otherA)) {
        update(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
            + literal(d) + ", " + literal(userA) + ", " + literal(workspaceA) + ", 'v11', '{}', '{}')");
        update(app, "INSERT INTO public.diagram_members (diagram_id, user_id, role) VALUES ("
            + literal(d) + ", " + literal(userA) + ", 'owner')");
      }
      update(app, "INSERT INTO public.threads (id, diagram_id, author, text) VALUES ("
          + literal(threadA) + ", " + literal(diagramA) + ", 'ann', 'hello')");
      update(app, "INSERT INTO public.share_links (diagram_id, workspace_id, token_hash, role, audience) VALUES ("
          + literal(diagramA) + ", " + literal(workspaceA) + ", '" + anyoneHash + "', 'viewer', 'anyone')");
      update(app, "INSERT INTO public.share_links (diagram_id, workspace_id, token_hash, role, audience) VALUES ("
          + literal(diagramA) + ", " + literal(workspaceA) + ", '" + workspaceHash + "', 'commenter', 'workspace')");
      // DB constraints: links never grant editing; raw tokens never fit token_hash.
      assertThatThrownBy(() -> update(app, "INSERT INTO public.share_links (diagram_id, workspace_id, token_hash, role, audience) VALUES ("
          + literal(diagramA) + ", " + literal(workspaceA) + ", '" + "c".repeat(64) + "', 'editor', 'anyone')"))
          .hasMessageContaining("chk_share_links_role");
      assertThatThrownBy(() -> update(app, "INSERT INTO public.share_links (diagram_id, workspace_id, token_hash, role, audience) VALUES ("
          + literal(diagramA) + ", " + literal(workspaceA) + ", 'raw-token', 'viewer', 'anyone')"))
          .hasMessageContaining("chk_share_links_token_hash");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_members")).isEqualTo(2);
      assertThat(count(app, "SELECT COUNT(*) FROM public.share_links")).isEqualTo(2);

      // Workspace B sees none of A's sharing rows and cannot plant any.
      exec(app, "SET app.current_user_id = " + literal(userB));
      update(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceB) + ", 'V11 B ws', 'member')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceB) + ", " + literal(userB) + ", 'admin', 'active')");
      exec(app, "SET app.current_user_role = 'member'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_members")).isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.share_links")).isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams WHERE id = " + literal(diagramA))).isZero();
      assertThatThrownBy(() -> update(app,
          "INSERT INTO public.diagram_members (diagram_id, user_id, role) VALUES ("
              + literal(diagramA) + ", " + literal(userB) + ", 'owner')"))
          .hasMessageContaining("row-level security");
      assertThatThrownBy(() -> update(app,
          "INSERT INTO public.access_requests (diagram_id, requester_id, role) VALUES ("
              + literal(diagramA) + ", " + literal(userA) + ", 'editor')"))
          .hasMessageContaining("row-level security");

      // Link-only request: no user identity, just the token hash.
      exec(app, "RESET app.current_user_id");
      exec(app, "RESET app.current_user_role");
      exec(app, "SET app.share_token_hash = '" + anyoneHash + "'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams")).isEqualTo(1);
      assertThat(singleString(app, "SELECT id FROM public.diagrams")).isEqualTo(diagramA.toString());
      assertThat(count(app, "SELECT COUNT(*) FROM public.threads")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.share_links")).isZero();
      assertThat(update(app, "UPDATE public.diagrams SET title = 'hijack' WHERE id = " + literal(diagramA))).isZero();
      assertThat(update(app, "DELETE FROM public.threads WHERE id = " + literal(threadA))).isZero();
      // A viewer link cannot comment.
      assertThatThrownBy(() -> update(app, "INSERT INTO public.threads (diagram_id, author, text) VALUES ("
          + literal(diagramA) + ", 'anon', 'spam')"))
          .hasMessageContaining("row-level security");

      // A workspace link without workspace membership reads nothing.
      exec(app, "SET app.share_token_hash = '" + workspaceHash + "'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams")).isZero();
      // A wrong hash reads nothing.
      exec(app, "SET app.share_token_hash = '" + "d".repeat(64) + "'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams")).isZero();

      // Revoked links stop working immediately.
      exec(app, "SET app.current_user_id = " + literal(userA));
      update(app, "UPDATE public.share_links SET revoked_at = now() WHERE token_hash = '" + anyoneHash + "'");
      exec(app, "RESET app.current_user_id");
      exec(app, "SET app.share_token_hash = '" + anyoneHash + "'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagrams")).isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.threads")).isZero();
      // ...but resolve_share_token still finds the row so /access can say 'expired'.
      assertThat(count(app, "SELECT COUNT(*) FROM public.resolve_share_token('" + anyoneHash
          + "') WHERE r_revoked_at IS NOT NULL")).isEqualTo(1);
      exec(app, "RESET app.share_token_hash");

      // 'request' info: hidden from an outsider with no link, shown with a
      // live link, and never to an identity-less caller.
      exec(app, "SET app.current_user_id = " + literal(userB));
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_request_info(" + literal(diagramA) + ")")).isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_owner_contacts(" + literal(diagramA) + ")")).isZero();
      exec(app, "SET app.share_token_hash = '" + workspaceHash + "'");
      assertThat(singleString(app, "SELECT r_owner_name FROM public.diagram_request_info(" + literal(diagramA) + ")"))
          .isEqualTo("V11 A");
      update(app, "INSERT INTO public.access_requests (diagram_id, requester_id, role) VALUES ("
          + literal(diagramA) + ", " + literal(userB) + ", 'viewer')");
      assertThatThrownBy(() -> update(app, "INSERT INTO public.access_requests (diagram_id, requester_id, role) VALUES ("
          + literal(diagramA) + ", " + literal(userB) + ", 'editor')"))
          .hasMessageContaining("uq_access_requests_pending");
      exec(app, "RESET app.share_token_hash");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_owner_contacts(" + literal(diagramA) + ")")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.access_requests")).isEqualTo(1);
      exec(app, "RESET app.current_user_id");
      exec(app, "SET app.share_token_hash = '" + workspaceHash + "'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.diagram_request_info(" + literal(diagramA) + ")")).isZero();
      exec(app, "RESET app.share_token_hash");
    }
  }

  /**
   * R1-E07-T07 (V15): under the least-privilege role, write policies enforce
   * role thresholds: viewers cannot write diagrams or member rows; commenters
   * can insert threads but not update diagrams.
   */
  @Test
  void v15RlsWritePoliciesEnforceRoleThresholds() throws Exception {
    try (Connection owner = DB.createConnection("")) {
      List<String> files;
      try (var stream = Files.list(migrationDir())) {
        files = stream.map(p -> p.getFileName().toString())
            .filter(n -> n.matches("V\\d+__.*\\.sql"))
            .sorted(MigrationFiles.BY_VERSION)
            .toList();
      }
      assertThat(files).contains("V15__rls_role_hardening.sql");
      for (String file : files) {
        exec(owner, Files.readString(migrationDir().resolve(file)));
      }
      exec(owner, "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tester') THEN CREATE ROLE app_tester WITH LOGIN PASSWORD 'tester-pw-123'; END IF; END $$");
      exec(owner, "GRANT USAGE ON SCHEMA public TO app_tester");
      for (String table : List.of("users", "diagrams", "workspaces", "workspace_memberships",
          "threads", "replies", "checkpoints", "diagram_members", "share_links",
          "access_requests", "diagram_revisions")) {
        exec(owner, "GRANT SELECT, INSERT, UPDATE, DELETE ON public." + table + " TO app_tester");
      }
      exec(owner, "GRANT SELECT, INSERT ON public.audit_log TO app_tester");
      exec(owner, "GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO app_tester");
      grantV11Helpers(owner, "app_tester");
      exec(owner, "GRANT EXECUTE ON FUNCTION public.diagram_role_at_least(uuid, uuid, text) TO app_tester");
    }

    UUID userA = UUID.randomUUID();
    UUID userB = UUID.randomUUID();
    UUID userC = UUID.randomUUID();
    UUID workspaceA = UUID.randomUUID();
    UUID diagramA = UUID.randomUUID();
    UUID threadA = UUID.randomUUID();

    Properties credentials = new Properties();
    credentials.setProperty("user", "app_tester");
    credentials.setProperty("password", "tester-pw-123");

    try (Connection app = DriverManager.getConnection(DB.getJdbcUrl(), credentials)) {
      // Setup: userA is owner, userB is viewer (explicit member), userC is commenter (explicit member)
      exec(app, "SET app.current_user_role = 'admin'");
      exec(app, "SET app.current_user_id = " + literal(userA));
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userA) + ", 'v15-a-" + userA + "@archflux.local', 'V15 A', 'member', 'email')");
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userB) + ", 'v15-b-" + userB + "@archflux.local', 'V15 B', 'member', 'email')");
      update(app, "INSERT INTO public.users (id, email, name, role, provider) VALUES ("
          + literal(userC) + ", 'v15-c-" + userC + "@archflux.local', 'V15 C', 'member', 'email')");
      update(app, "INSERT INTO public.workspaces (id, name, plan) VALUES ("
          + literal(workspaceA) + ", 'V15 A ws', 'member')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceA) + ", " + literal(userA) + ", 'admin', 'active')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceA) + ", " + literal(userB) + ", 'viewer', 'active')");
      update(app, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
          + literal(workspaceA) + ", " + literal(userC) + ", 'reviewer', 'active')");
      update(app, "INSERT INTO public.diagrams (id, owner_id, workspace_id, title, tags, graph) VALUES ("
          + literal(diagramA) + ", " + literal(userA) + ", " + literal(workspaceA) + ", 'v15', '{}', '{}')");
      update(app, "INSERT INTO public.diagram_members (diagram_id, user_id, role) VALUES ("
          + literal(diagramA) + ", " + literal(userA) + ", 'owner')");
      update(app, "INSERT INTO public.diagram_members (diagram_id, user_id, role) VALUES ("
          + literal(diagramA) + ", " + literal(userB) + ", 'viewer')");
      update(app, "INSERT INTO public.diagram_members (diagram_id, user_id, role) VALUES ("
          + literal(diagramA) + ", " + literal(userC) + ", 'commenter')");
      update(app, "INSERT INTO public.threads (id, diagram_id, author, text) VALUES ("
          + literal(threadA) + ", " + literal(diagramA) + ", 'ann', 'hello')");

      // --- viewer (userB) cannot UPDATE diagram
      exec(app, "SET app.current_user_id = " + literal(userB));
      exec(app, "SET app.current_user_role = 'member'");
      assertThat(update(app, "UPDATE public.diagrams SET title = 'hijack' WHERE id = "
          + literal(diagramA))).isZero();

      // --- viewer (userB) cannot INSERT into diagram_members
      assertThatThrownBy(() -> update(app,
          "INSERT INTO public.diagram_members (diagram_id, user_id, role) VALUES ("
              + literal(diagramA) + ", " + literal(userC) + ", 'viewer')"))
          .hasMessageContaining("row-level security");

      // --- commenter (userC) CAN INSERT thread
      exec(app, "SET app.current_user_id = " + literal(userC));
      UUID newThread = UUID.randomUUID();
      assertThat(update(app, "INSERT INTO public.threads (id, diagram_id, author, text) VALUES ("
          + literal(newThread) + ", " + literal(diagramA) + ", 'commenter', 'new thread')"))
          .isEqualTo(1);

      // --- commenter (userC) cannot UPDATE diagram
      assertThat(update(app, "UPDATE public.diagrams SET title = 'hijack' WHERE id = "
          + literal(diagramA))).isZero();

      // --- commenter (userC) cannot UPDATE thread (author is 'ann', not userC)
      // Service layer enforces author check; RLS allows EDITOR+ to update
      assertThat(update(app, "UPDATE public.threads SET text = 'hijack' WHERE id = "
          + literal(threadA))).isZero();

      // --- owner (userA) can UPDATE diagram
      exec(app, "SET app.current_user_id = " + literal(userA));
      exec(app, "SET app.current_user_role = 'admin'");
      assertThat(update(app, "UPDATE public.diagrams SET title = 'renamed by owner' WHERE id = "
          + literal(diagramA))).isEqualTo(1);
    }
  }
}