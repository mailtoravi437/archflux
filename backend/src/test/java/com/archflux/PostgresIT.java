package com.archflux;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Properties;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Shared scratch PostgreSQL (postgres:17-alpine) for all Spring tests. The
 * REAL db/migration (classpath)/V1__init.sql is applied via plain JDBC before any
 * context starts, so ddl-auto: validate runs against the true DBA-owned
 * schema. One container per JVM; tests isolate via @Transactional rollback
 * and unique fixtures.
 */
public abstract class PostgresIT {

  static final PostgreSQLContainer<?> DB =
      new PostgreSQLContainer<>("postgres:17-alpine");

  static {
    ensureDockerHost();
    DB.start();
    TestSchema.applyV1(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword());
  }

  /**
   * Makes {@code mvn test} work out of the box on machines where Docker is
   * exposed through a non-default socket (e.g. Colima on macOS): if neither
   * DOCKER_HOST nor docker.host is configured, probe well-known socket paths
   * and set the {@code docker.host} system property honored by
   * Testcontainers' EnvironmentAndSystemPropertyClientProviderStrategy.
   */
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
      if (java.nio.file.Files.exists(java.nio.file.Path.of(candidate))) {
        System.setProperty("docker.host", "unix://" + candidate);
        return;
      }
    }
  }

  @DynamicPropertySource
  static void postgresProps(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", DB::getJdbcUrl);
    registry.add("spring.datasource.username", DB::getUsername);
    registry.add("spring.datasource.password", DB::getPassword);
  }

  /** Applies the real db/migration (classpath)/*.sql files (V1..Vn) in order. */
  public static final class TestSchema {

    private TestSchema() {
    }

    public static void applyV1(String jdbcUrl, String username, String password) {
      for (Path migration : locateMigrations()) {
        try {
          String sql = Files.readString(migration);
          PGSimpleDataSource ds = new PGSimpleDataSource();
          ds.setUrl(jdbcUrl);
          ds.setUser(username);
          ds.setPassword(password);
          try (Connection connection = ds.getConnection();
              Statement statement = connection.createStatement()) {
            // pgjdbc simple-query protocol runs the whole script, DO blocks included.
            statement.execute(sql);
          }
        } catch (Exception e) {
          throw new IllegalStateException("Failed to apply " + migration + ": " + e.getMessage(), e);
        }
      }
    }

    static java.util.List<Path> locateMigrations() {
      // Tests run with user.dir = server/ -> ../db/migration (classpath)/Vn__*.sql
      Path[] dirs = {
          MigrationFiles.dir(),
      };
      for (Path dir : dirs) {
        try (var stream = Files.list(dir)) {
          var found = stream.filter(p -> p.getFileName().toString().matches("V\\d+__.*\\.sql"))
              .sorted(java.util.Comparator.comparing(
                  (Path p) -> p.getFileName().toString(), MigrationFiles.BY_VERSION))
              .toList();
          if (!found.isEmpty()) {
            return found;
          }
        } catch (Exception ignored) {
          // try next candidate
        }
      }
      throw new IllegalStateException(
          "Could not locate db/migration (classpath)/V*__*.sql from user.dir=" + System.getProperty("user.dir"));
    }
  }

  // Keep DriverManager import referenced for future fallback wiring.
  @SuppressWarnings("unused")
  private static Connection fallbackConnect(String url, Properties props) throws Exception {
    return DriverManager.getConnection(url, props);
  }
}
