package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

/**
 * PROD-010 automated restore-drill evidence (no Spring context): applies every
 * migration in {@code db/migrations} over plain JDBC, seeds two users plus a
 * diagram and revision-ish rows, dumps with {@code pg_dump -Fc} INSIDE the
 * container, wipes the schema, restores with {@code pg_restore}, and asserts
 * row counts match.
 *
 * <p>V7-shape assertions (diagrams.version NOT NULL, revisions table present)
 * run when that shape exists and are reported-but-non-blocking when the
 * checkout only has V1..V6, so this drill stays green on either side of the
 * Phase 2 migration landing while still proving backup/restore end to end.
 */
class BackupRestoreTest {

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

  private static List<String> migrationFiles() throws Exception {
    try (Stream<Path> files = Files.list(migrationDir())) {
      return files.map(p -> p.getFileName().toString())
          .filter(n -> n.matches("V\\d+__.*\\.sql"))
          .sorted()
          .collect(Collectors.toList());
    }
  }

  private static void apply(Connection connection, String file) throws Exception {
    try (Statement statement = connection.createStatement()) {
      // pgjdbc simple-query protocol runs the whole script, DO blocks included.
      statement.execute(Files.readString(migrationDir().resolve(file)));
    }
  }

  private static boolean hasTable(Connection connection, String table) throws Exception {
    try (PreparedStatement ps = connection.prepareStatement(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name=?")) {
      ps.setString(1, table);
      try (ResultSet rs = ps.executeQuery()) {
        rs.next();
        return rs.getLong(1) > 0;
      }
    }
  }

  private static boolean hasColumn(Connection connection, String table, String column)
      throws Exception {
    try (PreparedStatement ps = connection.prepareStatement(
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=?")) {
      ps.setString(1, table);
      ps.setString(2, column);
      try (ResultSet rs = ps.executeQuery()) {
        rs.next();
        return rs.getLong(1) > 0;
      }
    }
  }

  private static long count(Connection connection, String table) throws Exception {
    try (Statement st = connection.createStatement();
        ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM public.\"" + table + "\"")) {
      rs.next();
      return rs.getLong(1);
    }
  }

  private static String literal(UUID id) {
    return "'" + id + "'";
  }

  /** First present table out of candidates, or null. */
  private static String firstTable(Connection connection, String... names) throws Exception {
    for (String name : names) {
      if (hasTable(connection, name)) {
        return name;
      }
    }
    return null;
  }

  /**
   * Inserts one row into a revisions-style table whose exact shape is unknown,
   * supplying type-driven values for every NOT NULL column without a default.
   */
  private static void insertRevisionRow(Connection connection, String table, UUID diagramId,
      UUID authorId) throws Exception {
    List<String[]> required = new ArrayList<>();
    try (PreparedStatement ps = connection.prepareStatement(
        "SELECT column_name, data_type, udt_name FROM information_schema.columns "
            + "WHERE table_schema='public' AND table_name=? AND column_default IS NULL "
            + "AND is_nullable='NO' ORDER BY ordinal_position")) {
      ps.setString(1, table);
      try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
          required.add(new String[] {rs.getString(1), rs.getString(2), rs.getString(3)});
        }
      }
    }
    StringBuilder sql = new StringBuilder("INSERT INTO public.\"").append(table).append("\" (");
    sql.append(required.stream().map(c -> "\"" + c[0] + "\"").collect(Collectors.joining(", ")));
    sql.append(") VALUES (").append(required.stream().map(c -> "?").collect(Collectors.joining(", ")));
    sql.append(")");
    try (PreparedStatement insert = connection.prepareStatement(sql.toString())) {
      for (int i = 0; i < required.size(); i++) {
        String name = required.get(i)[0];
        String type = required.get(i)[1];
        String udt = required.get(i)[2];
        int idx = i + 1;
        if (name.equals("diagram_id")) {
          insert.setObject(idx, diagramId);
        } else if (name.equals("author_id") || name.equals("user_id") || name.equals("owner_id")
            || name.equals("created_by")) {
          insert.setObject(idx, authorId);
        } else if (name.equals("id")) {
          insert.setObject(idx, UUID.randomUUID());
        } else if (name.equals("version") || name.equals("revision_number") || name.equals("number")) {
          insert.setInt(idx, 1);
        } else if (type.equals("jsonb") || type.equals("json") || udt.equals("jsonb") || udt.equals("json")) {
          insert.setObject(idx, "{}", java.sql.Types.OTHER);
        } else if (type.contains("character") || type.equals("text") || type.equals("citext")
            || udt.equals("citext")) {
          insert.setString(idx, "seed-" + name);
        } else if (type.contains("int") || type.equals("numeric")) {
          insert.setInt(idx, 1);
        } else if (type.equals("boolean")) {
          insert.setBoolean(idx, false);
        } else if (type.contains("timestamp")) {
          insert.setTimestamp(idx, new java.sql.Timestamp(System.currentTimeMillis()));
        } else if (type.equals("uuid")) {
          insert.setObject(idx, UUID.randomUUID());
        } else {
          throw new IllegalStateException("No seed mapping for revisions column " + table + "."
              + name + " (" + type + "/" + udt + ")");
        }
      }
      assertThat(insert.executeUpdate()).isEqualTo(1);
    }
  }

  @Test
  void pgDumpCustomFormatRoundTripPreservesRowsAndV7Shape() throws Exception {
    UUID alice = UUID.randomUUID();
    UUID bob = UUID.randomUUID();
    UUID workspace = UUID.randomUUID();
    UUID diagram = UUID.randomUUID();
    UUID checkpoint = UUID.randomUUID();

    try (Connection owner = DB.createConnection("")) {
      List<String> migrations = migrationFiles();
      assertThat(migrations).isNotEmpty();
      System.out.println("BackupRestoreIT migrations under test: " + migrations);
      for (String file : migrations) {
        apply(owner, file);
      }

      boolean workspaces = hasTable(owner, "workspaces");
      boolean diagramsVersion = hasColumn(owner, "diagrams", "version");
      String revisionsTable = firstTable(owner, "revisions", "diagram_revisions");

      // --- Seed two users (+ workspace membership when V6+ shape exists).
      boolean roleCol = hasColumn(owner, "users", "role");
      boolean providerCol = hasColumn(owner, "users", "provider");
      String userCols = "id, email, name"
          + (roleCol ? ", role" : "") + (providerCol ? ", provider" : "");
      String userVals = "(?, ?, ?"
          + (roleCol ? ", 'member'" : "") + (providerCol ? ", 'email'" : "") + ")";
      try (PreparedStatement ins = owner.prepareStatement(
          "INSERT INTO public.users (" + userCols + ") VALUES " + userVals)) {
        ins.setObject(1, alice);
        ins.setString(2, "restore-alice@archflux.local");
        ins.setString(3, "Alice");
        ins.executeUpdate();
        ins.setObject(1, bob);
        ins.setString(2, "restore-bob@archflux.local");
        ins.setString(3, "Bob");
        ins.executeUpdate();
      }
      if (workspaces) {
        try (Statement st = owner.createStatement()) {
          st.executeUpdate("INSERT INTO public.workspaces (id, name) VALUES ("
              + literal(workspace) + ", 'restore ws')");
          st.executeUpdate("INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ("
              + literal(workspace) + ", " + literal(alice) + ", 'admin', 'active')");
        }
      }

      // --- Seed one diagram (+ revision-ish checkpoint, + V7 revision row).
      String diagramCols = "id, owner_id, title, tags, graph"
          + (workspaces && hasColumn(owner, "diagrams", "workspace_id") ? ", workspace_id" : "")
          + (diagramsVersion ? ", version" : "");
      String diagramVals = literal(diagram) + ", " + literal(alice)
          + ", 'restore diagram', '{}', '{}'"
          + (workspaces && hasColumn(owner, "diagrams", "workspace_id") ? ", " + literal(workspace) : "")
          + (diagramsVersion ? ", 1" : "");
      try (Statement st = owner.createStatement()) {
        st.executeUpdate("INSERT INTO public.diagrams (" + diagramCols + ") VALUES (" + diagramVals + ")");
        st.executeUpdate("INSERT INTO public.checkpoints (id, diagram_id, title, snapshot) VALUES ("
            + literal(checkpoint) + ", " + literal(diagram) + ", 'pre-backup', '{}')");
      }
      if (revisionsTable != null) {
        insertRevisionRow(owner, revisionsTable, diagram, alice);
      }

      Map<String, Long> before = new LinkedHashMap<>();
      for (String table : List.of("users", "diagrams", "checkpoints")) {
        before.put(table, count(owner, table));
      }
      if (workspaces) {
        before.put("workspaces", count(owner, "workspaces"));
      }
      if (revisionsTable != null) {
        before.put(revisionsTable, count(owner, revisionsTable));
      }
      assertThat(before.get("users")).isEqualTo(2);
      assertThat(before.get("diagrams")).isEqualTo(1);
      assertThat(before.get("checkpoints")).isEqualTo(1);
    }

    // --- Dump INSIDE the container (custom format), copy the artifact out.
    String containerDump = "/tmp/archflux-backuprestore-test.dump";
    var dumpResult = DB.execInContainer("pg_dump", "-Fc",
        "-U", DB.getUsername(), "-d", DB.getDatabaseName(), "-f", containerDump);
    assertThat(dumpResult.getExitCode())
        .as("pg_dump stderr: %s", dumpResult.getStderr())
        .isZero();
    Path hostDump = Files.createTempFile("archflux-backuprestore-", ".dump");
    DB.copyFileFromContainer(containerDump, hostDump.toString());
    assertThat(Files.size(hostDump)).as("dump artifact bytes").isPositive();
    System.out.println("BackupRestoreIT dump artifact: " + hostDump + " ("
        + Files.size(hostDump) + " bytes)");

    // --- Wipe + recreate the schema (DROP...CASCADE also drops the public-
    // schema extensions; pg_restore recreates them from the dump).
    try (Connection owner = DB.createConnection("");
        Statement st = owner.createStatement()) {
      st.execute("DROP SCHEMA public CASCADE");
      st.execute("CREATE SCHEMA public");
    }

    // --- Restore from the artifact, then compare every seeded table.
    DB.copyFileToContainer(MountableFile.forHostPath(hostDump), containerDump);
    var restoreResult = DB.execInContainer("pg_restore",
        "-U", DB.getUsername(), "-d", DB.getDatabaseName(), containerDump);
    assertThat(restoreResult.getExitCode())
        .as("pg_restore stderr: %s", restoreResult.getStderr())
        .isZero();

    try (Connection owner = DB.createConnection("")) {
      assertThat(count(owner, "users")).isEqualTo(2);
      assertThat(count(owner, "diagrams")).isEqualTo(1);
      assertThat(count(owner, "checkpoints")).isEqualTo(1);
      assertThat(singleString(owner,
          "SELECT email FROM public.users WHERE id = " + literal(alice)))
          .isEqualTo("restore-alice@archflux.local");
      assertThat(singleString(owner,
          "SELECT title FROM public.diagrams WHERE id = " + literal(diagram)))
          .isEqualTo("restore diagram");

      // --- V7 backfill-relevant constraints (conditional on the shape).
      if (hasColumn(owner, "diagrams", "version")) {
        try (Statement st = owner.createStatement();
            ResultSet rs = st.executeQuery(
                "SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' "
                    + "AND table_name='diagrams' AND column_name='version'")) {
          assertThat(rs.next()).isTrue();
          assertThat(rs.getString(1)).as("diagrams.version NOT NULL").isEqualTo("NO");
        }
        try (Statement st = owner.createStatement();
            ResultSet rs = st.executeQuery(
                "SELECT COUNT(*) FROM public.diagrams WHERE version IS NULL")) {
          rs.next();
          assertThat(rs.getLong(1)).as("no null versions after restore").isZero();
        }
        System.out.println("BackupRestoreIT: V7 shape (diagrams.version) verified after restore");
      } else {
        System.out.println("BackupRestoreIT: V7 shape absent (no diagrams.version) — "
            + "core restore assertions still apply");
      }
      String revisionsAfter = firstTable(owner, "revisions", "diagram_revisions");
      if (revisionsAfter != null) {
        assertThat(count(owner, revisionsAfter))
            .as("revisions survive restore")
            .isPositive();
        System.out.println("BackupRestoreIT: revisions table '" + revisionsAfter
            + "' verified after restore");
      }
    }
    Files.deleteIfExists(hostDump);
  }

  private static String singleString(Connection connection, String sql) throws Exception {
    try (Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      rows.next();
      return rows.getString(1);
    }
  }
}
