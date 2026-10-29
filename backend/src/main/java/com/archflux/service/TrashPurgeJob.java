package com.archflux.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.persistence.EntityManager;

/**
 * Nightly trash purge (R1-E06-T02, DATA_MODEL_R1 §4.2): hard-deletes
 * diagrams and folders whose {@code deleted_at} is older than the
 * workspace's retention (30 days, 90 on the team plan), in batches of
 * {@value #BATCH_SIZE}, auditing each row as the system (no actor).
 *
 * <p>The delete runs through the V10 SECURITY DEFINER function
 * {@code purge_expired_trash}: the scheduler has no request identity, so the
 * app role's RLS policies would hide every row from a plain DELETE.
 * Disabled with {@code archflux.trash.purge-enabled=false} (test default).
 */
@Component
public class TrashPurgeJob {

  private static final Logger log = LoggerFactory.getLogger(TrashPurgeJob.class);

  public static final int BATCH_SIZE = 100;
  /** Upper bound on batches per run so one run can never spin forever. */
  static final int MAX_BATCHES = 1000;

  private final EntityManager entityManager;
  private final AuditService audit;
  private final TransactionTemplate tx;
  private final Clock clock;
  private final boolean enabled;

  @Autowired
  public TrashPurgeJob(EntityManager entityManager, AuditService audit,
      PlatformTransactionManager transactionManager,
      @Value("${archflux.trash.purge-enabled:true}") boolean enabled) {
    this(entityManager, audit, transactionManager, Clock.systemUTC(), enabled);
  }

  public TrashPurgeJob(EntityManager entityManager, AuditService audit,
      PlatformTransactionManager transactionManager, Clock clock, boolean enabled) {
    this.entityManager = entityManager;
    this.audit = audit;
    this.tx = new TransactionTemplate(transactionManager);
    this.clock = clock;
    this.enabled = enabled;
  }

  @Scheduled(cron = "0 17 3 * * *")
  public void scheduledRun() {
    if (!enabled) {
      return;
    }
    try {
      int purged = purgeExpired();
      if (purged > 0) {
        log.info("Trash purge removed {} expired rows", purged);
      }
    } catch (Exception e) {
      log.warn("Trash purge failed: {}", e.getMessage());
    }
  }

  /** Purges everything past retention as of this job's clock; returns rows removed. */
  public int purgeExpired() {
    Instant now = clock.instant();
    int total = 0;
    for (int batch = 0; batch < MAX_BATCHES; batch++) {
      BatchResult result = tx.execute(status -> purgeBatch(now));
      if (result == null) {
        break;
      }
      total += result.diagrams() + result.folders();
      if (result.diagrams() < BATCH_SIZE && result.folders() < BATCH_SIZE) {
        break;
      }
    }
    return total;
  }

  private record BatchResult(int diagrams, int folders) {
  }

  /** One batch: up to BATCH_SIZE diagrams plus up to BATCH_SIZE folders. */
  private BatchResult purgeBatch(Instant now) {
    entityManager.flush();
    @SuppressWarnings("unchecked")
    List<Object[]> rows = entityManager.createNativeQuery(
            "SELECT r_kind, r_id, r_workspace_id FROM public.purge_expired_trash(:now, :limit)")
        .setParameter("now", Timestamp.from(now))
        .setParameter("limit", BATCH_SIZE)
        .getResultList();
    // Native deletes bypass the persistence context: drop stale managed rows.
    entityManager.clear();
    int diagrams = 0;
    int folders = 0;
    for (Object[] row : rows) {
      String kind = String.valueOf(row[0]);
      UUID id = (UUID) row[1];
      UUID workspaceId = (UUID) row[2];
      audit.record(null, workspaceId, kind + ".purge", kind, id.toString(), "ok");
      if ("diagram".equals(kind)) {
        diagrams++;
      } else {
        folders++;
      }
    }
    return new BatchResult(diagrams, folders);
  }
}
