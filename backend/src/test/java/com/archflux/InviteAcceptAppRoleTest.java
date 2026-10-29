package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;

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
 * R1-BUG-06: the real production role {@code archflux_app}, created by running
 * {@code db/roles.sql} AFTER all migrations (the fresh-environment order), must be able
 * to accept a workspace invite. Backend integration tests run as the DB owner, which
 * bypasses RLS and ignores missing EXECUTE grants, so they cannot see this class of bug.
 */
class InviteAcceptAppRoleTest {

  private static final PostgreSQLContainer<?> DB =
      new PostgreSQLContainer<>("postgres:17-alpine");

  @BeforeAll
  static void start() {
    AppRoleTest.ensureDockerHost();
    DB.start();
  }

  @AfterAll
  static void stop() {
    DB.stop();
  }

  private static void exec(Connection c, String sql) throws Exception {
    try (Statement s = c.createStatement()) {
      s.execute(sql);
    }
  }

  private static long count(Connection c, String sql) throws Exception {
    try (Statement s = c.createStatement(); ResultSet r = s.executeQuery(sql)) {
      r.next();
      return r.getLong(1);
    }
  }

  private static int update(Connection c, String sql) throws Exception {
    try (Statement s = c.createStatement()) {
      return s.executeUpdate(sql);
    }
  }

  private static Path dbDir() {
    return Path.of(System.getProperty("user.dir"), "db");
  }

  @Test
  void inviteeCanAcceptInviteUnderArchfluxAppRole() throws Exception {
    UUID admin = UUID.randomUUID();
    UUID invitee = UUID.randomUUID();
    UUID outsider = UUID.randomUUID();
    UUID ws = UUID.randomUUID();
    UUID otherWs = UUID.randomUUID();
    UUID inviteId = UUID.randomUUID();
    UUID otherInviteId = UUID.randomUUID();
    String hash = "a".repeat(64);
    String otherHash = "b".repeat(64);

    try (Connection owner = DB.createConnection("")) {
      List<String> files;
      try (var stream = Files.list(MigrationFiles.dir())) {
        files = stream.map(p -> p.getFileName().toString())
            .filter(n -> n.matches("V\\d+__.*\\.sql"))
            .sorted(MigrationFiles.BY_VERSION)
            .toList();
      }
      for (String f : files) {
        exec(owner, Files.readString(MigrationFiles.dir().resolve(f)));
      }
      // Fresh environment order: roles.sql runs after the migrations.
      String roles = Files.readString(dbDir().resolve("roles.sql"))
          .replace(":'MIGRATOR_PASSWORD'", "'migrator-pw-123'")
          .replace(":'APP_PASSWORD'", "'app-pw-123'");
      exec(owner, roles);

      exec(owner, "INSERT INTO public.users (id, email, name, role, provider) VALUES "
          + "('" + admin + "', 'adm-" + admin + "@archflux.local', 'Adm', 'member', 'email'), "
          + "('" + invitee + "', 'invitee@archflux.local', 'Invitee', 'member', 'email'), "
          + "('" + outsider + "', 'outsider@archflux.local', 'Out', 'member', 'email')");
      exec(owner, "INSERT INTO public.workspaces (id, name, plan) VALUES "
          + "('" + ws + "', 'Team', 'member'), ('" + otherWs + "', 'Other', 'member')");
      exec(owner, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES "
          + "('" + ws + "', '" + admin + "', 'admin', 'active')");
      exec(owner, "INSERT INTO public.workspace_invites (id, workspace_id, email, role, token_hash, invited_by, expires_at) VALUES "
          + "('" + inviteId + "', '" + ws + "', 'Invitee@archflux.local', 'viewer', '" + hash
          + "', '" + admin + "', now() + interval '7 days'), "
          + "('" + otherInviteId + "', '" + otherWs + "', 'someone-else@archflux.local', 'viewer', '"
          + otherHash + "', '" + admin + "', now() + interval '7 days')");
    }

    Properties credentials = new Properties();
    credentials.setProperty("user", "archflux_app");
    credentials.setProperty("password", "app-pw-123");
    try (Connection app = DriverManager.getConnection(DB.getJdbcUrl(), credentials)) {
      exec(app, "SET app.current_user_id = '" + invitee + "'");
      exec(app, "SET app.current_user_role = 'member'");

      // The steps WorkspaceInviteService.accept performs, in order.
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspace_invites WHERE token_hash = '"
          + hash + "'")).as("invitee sees own invite").isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspace_invites WHERE token_hash = '"
          + otherHash + "'")).as("other invites stay hidden").isZero();
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspaces WHERE id = '" + ws + "'"))
          .as("invitee can read the invited workspace (was 404 Workspace not found)")
          .isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspaces WHERE id = '" + otherWs + "'"))
          .as("uninvited workspace stays hidden").isZero();
      assertThat(update(app, "INSERT INTO public.workspace_memberships "
          + "(workspace_id, user_id, role, status) VALUES ('" + ws + "', '" + invitee
          + "', 'viewer', 'active')")).isEqualTo(1);
      assertThat(update(app, "UPDATE public.workspace_invites SET accepted_at = now() WHERE id = '"
          + inviteId + "'")).isEqualTo(1);
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspaces WHERE id = '" + ws + "'"))
          .isEqualTo(1);

      // A user with no invite learns nothing about the workspace.
      exec(app, "SET app.current_user_id = '" + outsider + "'");
      assertThat(count(app, "SELECT COUNT(*) FROM public.workspaces WHERE id = '" + ws + "'"))
          .isZero();
    }
  }
}
