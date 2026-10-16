package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * PROD-005 upgrade path (no Spring context): applies V1..V5 via plain JDBC on
 * a scratch PostgreSQL 17, seeds two users plus one diagram each, applies V6,
 * asserts the backfill, then applies V6 AGAIN to prove re-runnability.
 */
class V6UpgradeTest {

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

  private static List<String> queryStrings(Connection connection, String sql) throws Exception {
    List<String> out = new ArrayList<>();
    try (Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      while (rows.next()) {
        out.add(rows.getString(1));
      }
    }
    return out;
  }

  @Test
  void upgradeBackfillsPersonalWorkspacesAndIsRerunnable() throws Exception {
    UUID alice = UUID.randomUUID();
    UUID bob = UUID.randomUUID();
    UUID diagramA = UUID.randomUUID();
    UUID diagramB = UUID.randomUUID();

    try (Connection admin = DB.createConnection("")) {
      for (String file : List.of("V1__init.sql", "V2__additional_indexes.sql",
          "V3__production_hardening.sql", "V4__oauth_fields.sql", "V5__versioning_branching.sql")) {
        apply(admin, file);
      }

      // Pre-V6 seed: users + diagrams without any workspace columns.
      try (PreparedStatement insertUser = admin.prepareStatement(
          "INSERT INTO public.users (id, email, name, role, provider) VALUES (?, ?, ?, ?, ?)")) {
        insertUser.setObject(1, alice);
        insertUser.setString(2, "v6-alice@archflux.local");
        insertUser.setString(3, "Alice Liddell");
        insertUser.setString(4, "member");
        insertUser.setString(5, "email");
        insertUser.executeUpdate();

        insertUser.setObject(1, bob);
        insertUser.setString(2, "v6-bob@archflux.local");
        insertUser.setString(3, "");
        insertUser.setString(4, "member");
        insertUser.setString(5, "github");
        insertUser.executeUpdate();
      }
      try (PreparedStatement insertDiagram = admin.prepareStatement(
          "INSERT INTO public.diagrams (id, owner_id, title, tags, graph) VALUES (?, ?, ?, '{}', '{}')")) {
        insertDiagram.setObject(1, diagramA);
        insertDiagram.setObject(2, alice);
        insertDiagram.setString(3, "alice diagram");
        insertDiagram.executeUpdate();

        insertDiagram.setObject(1, diagramB);
        insertDiagram.setObject(2, bob);
        insertDiagram.setString(3, "bob diagram");
        insertDiagram.executeUpdate();
      }

      apply(admin, "V6__workspaces.sql");
      assertBackfill(admin, alice, bob, diagramA, diagramB);

      // Re-apply proves re-runnability; nothing may change.
      apply(admin, "V6__workspaces.sql");
      assertBackfill(admin, alice, bob, diagramA, diagramB);
    }
  }

  private void assertBackfill(Connection admin, UUID alice, UUID bob, UUID diagramA, UUID diagramB)
      throws Exception {
    // One personal workspace per user.
    assertThat(count(admin, "SELECT COUNT(*) FROM public.workspaces")).isEqualTo(2);
    List<String> names = queryStrings(admin, "SELECT name FROM public.workspaces ORDER BY name");
    assertThat(names).containsExactlyInAnyOrder("Alice Liddell's workspace", "Personal");

    // Admin/active memberships linking each user to their workspace.
    assertThat(count(admin, "SELECT COUNT(*) FROM public.workspace_memberships")).isEqualTo(2);
    assertThat(count(admin,
        "SELECT COUNT(*) FROM public.workspace_memberships WHERE role = 'admin' AND status = 'active'"))
        .isEqualTo(2);

    // diagrams.workspace_id is NOT NULL and points at the owner's workspace.
    try (Statement statement = admin.createStatement();
        ResultSet rows = statement.executeQuery(
            "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' "
                + "AND table_name = 'diagrams' AND column_name = 'workspace_id'")) {
      assertThat(rows.next()).isTrue();
      assertThat(rows.getString(1)).isEqualTo("NO");
    }
    assertThat(count(admin, "SELECT COUNT(*) FROM public.diagrams WHERE workspace_id IS NULL"))
        .isEqualTo(0);
    assertThat(count(admin,
        "SELECT COUNT(*) FROM public.diagrams d JOIN public.workspace_memberships m "
            + "ON m.workspace_id = d.workspace_id AND m.user_id = d.owner_id"))
        .isEqualTo(2);

    // Explicit constraint + index + RLS shape.
    assertThat(count(admin,
        "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_diagrams_workspace'"))
        .isEqualTo(1);
    for (String index : List.of("idx_diagrams_workspace", "idx_memberships_user",
        "idx_memberships_workspace")) {
      assertThat(count(admin,
          "SELECT COUNT(*) FROM pg_class WHERE relname = '" + index + "'")).isEqualTo(1);
    }
    assertThat(count(admin,
        "SELECT COUNT(*) FROM pg_class WHERE relname IN ('workspaces', 'workspace_memberships') "
            + "AND relrowsecurity = true")).isEqualTo(2);
    assertThat(count(admin,
        "SELECT COUNT(*) FROM pg_policy WHERE polname IN ('workspaces_member', "
            + "'workspaces_insert_bootstrap', 'memberships_member', 'memberships_self_join')"))
        .isEqualTo(4);

    // Audit trigger hardened: SECURITY DEFINER with locked search_path.
    try (Statement statement = admin.createStatement();
        ResultSet rows = statement.executeQuery(
            "SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'audit_trigger_fn'")) {
      assertThat(rows.next()).isTrue();
      assertThat(rows.getBoolean(1)).isTrue();
      Object[] config = (Object[]) rows.getArray(2).getArray();
      assertThat(List.of(config)).contains("search_path=public");
    }

    // RLS membership helper: same hardening (policies cannot subquery self).
    try (Statement statement = admin.createStatement();
        ResultSet rows = statement.executeQuery(
            "SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'is_workspace_member'")) {
      assertThat(rows.next()).isTrue();
      assertThat(rows.getBoolean(1)).isTrue();
      Object[] config = (Object[]) rows.getArray(2).getArray();
      assertThat(List.of(config)).contains("search_path=public");
    }

    // Widened provider allow-list accepts the enterprise values, rejects junk.
    UUID probe = UUID.randomUUID();
    try (PreparedStatement insert = admin.prepareStatement(
        "INSERT INTO public.users (id, email, name, provider) VALUES (?, ?, ?, ?)")) {
      for (String provider : List.of("sso", "oidc", "saml", "mock")) {
        UUID id = UUID.randomUUID();
        insert.setObject(1, id);
        insert.setString(2, "v6-" + provider + "-" + id + "@archflux.local");
        insert.setString(3, "Probe");
        insert.setString(4, provider);
        insert.executeUpdate();
      }
      insert.setObject(1, probe);
      insert.setString(2, "v6-probe@archflux.local");
      insert.setString(3, "Probe");
      insert.setString(4, "ftp");
      assertThatThrownBy(insert::executeUpdate).hasMessageContaining("chk_users_provider");
    }
    try (PreparedStatement delete = admin.prepareStatement(
        "DELETE FROM public.users WHERE email LIKE 'v6-%@archflux.local' AND id <> ? AND id <> ?")) {
      delete.setObject(1, alice);
      delete.setObject(2, bob);
      delete.executeUpdate();
    }
  }
}
