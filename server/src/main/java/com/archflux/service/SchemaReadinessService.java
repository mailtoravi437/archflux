package com.archflux.service;

import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Guards every DB-touching entry point: verifies the V1 tables exist via a
 * {@code to_regclass} check (never crashes boot — evaluated per call). When
 * tables are absent, callers fail with 500 DB_UNAVAILABLE + migration pointer
 * instead of a raw persistence exception.
 */
@Service
public class SchemaReadinessService {

  private static final Logger log = LoggerFactory.getLogger(SchemaReadinessService.class);

  static final List<String> REQUIRED_TABLES = List.of(
      "users", "diagrams", "checkpoints", "threads", "replies", "sync_log");

  private final JdbcTemplate jdbc;

  public SchemaReadinessService(DataSource dataSource) {
    this.jdbc = new JdbcTemplate(dataSource);
  }

  /** Returns the subset of required tables that are missing (empty = ready). */
  public List<String> missingTables() {
    // Fast path: one cheap probe first so a fully-down DB costs a single
    // connection timeout instead of one per table.
    try {
      jdbc.queryForObject("SELECT 1", Integer.class);
    } catch (DataAccessException e) {
      log.warn("Readiness probe failed: database unreachable");
      return new ArrayList<>(REQUIRED_TABLES);
    }
    List<String> missing = new ArrayList<>();
    for (String table : REQUIRED_TABLES) {
      try {
        String regclass = jdbc.queryForObject(
            "SELECT to_regclass('public." + table + "')", String.class);
        if (regclass == null) {
          missing.add(table);
        }
      } catch (DataAccessException e) {
        log.warn("Readiness probe failed for table {} (host/db unreachable?)", table);
        missing.add(table);
      }
    }
    return missing;
  }

  public boolean isReady() {
    return missingTables().isEmpty();
  }

  /** Throws {@link ApiException} DB_UNAVAILABLE when the schema is not present. */
  public void requireReady() {
    List<String> missing = missingTables();
    if (!missing.isEmpty()) {
      log.warn("DB schema not ready; missing tables: {}", missing);
      throw ApiException.dbUnavailable();
    }
  }
}
