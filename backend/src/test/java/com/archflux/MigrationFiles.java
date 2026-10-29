package com.archflux;

import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Locates the Flyway migrations exactly as production loads them — from the
 * classpath ({@code db/migration}) — so tests and runtime can never diverge
 * (SERVICES_SPEC §4.3, SVC-G11/G12).
 */
public final class MigrationFiles {

  private MigrationFiles() {
  }

  public static Path dir() {
    URL url = MigrationFiles.class.getClassLoader().getResource("db/migration");
    try {
      if (url != null && "file".equals(url.getProtocol())) {
        Path dir = Path.of(url.toURI());
        if (Files.isDirectory(dir)) {
          return dir;
        }
      }
    } catch (Exception ignored) {
      // fall through to the source tree
    }
    Path source = Path.of(System.getProperty("user.dir"), "src", "main", "resources", "db", "migration");
    if (Files.isDirectory(source)) {
      return source;
    }
    throw new IllegalStateException("Could not locate classpath db/migration from user.dir="
        + System.getProperty("user.dir"));
  }

  /** Flyway version of a {@code V<n>__name.sql} file name (-1 when not a migration). */
  public static int version(String fileName) {
    java.util.regex.Matcher m = java.util.regex.Pattern.compile("^V(\\d+)__.*\\.sql$").matcher(fileName);
    return m.matches() ? Integer.parseInt(m.group(1)) : -1;
  }

  /**
   * Orders migration file names by numeric version, as Flyway does. Plain
   * string order would run V10 before V2.
   */
  public static final java.util.Comparator<String> BY_VERSION =
      java.util.Comparator.comparingInt(MigrationFiles::version);
}
