package com.archflux.service;

import java.util.UUID;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import com.archflux.security.RequestUser;

/**
 * Transaction-scoped request identity for PostgreSQL RLS (PRODUCTIZATION_SPEC
 * 5.4, SPEC_REPORT G5).
 *
 * <p>On entry to {@code @Transactional} service methods, publishes the
 * authenticated user (and role) to the transaction-local
 * {@code app.current_user_id} / {@code app.current_user_role} GUCs via
 * {@code SELECT set_config(..., true)} executed through the transactional
 * {@link EntityManager} — hence on the same connection/transaction as the
 * business queries that follow.
 *
 * <p>Safety rules:
 * <ul>
 *   <li>No {@code RequestUser} on the current request (tests, scheduler,
 *       unauthenticated paths) → no-op.</li>
 *   <li>No active transaction (the advice ran outside the transaction
 *       advisor) → no-op; {@code SET LOCAL} outside a transaction block
 *       would only warn and evaporate.</li>
 *   <li>Read-only transactions → safe: {@code SELECT set_config} performs no
 *       catalog write and is allowed.</li>
 *   <li>Failures never break business logic: RLS is defense in depth, the
 *       service-layer membership checks are the primary gate.</li>
 * </ul>
 *
 * <p>Ordering note: this advice is {@link Ordered#LOWEST_PRECEDENCE}, tying
 * with the transaction advisor, which is discovered first — so the
 * transaction is normally already active when this runs. The
 * {@code isActualTransactionActive} guard keeps it correct regardless.
 */
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class RequestIdentityAspect {

  private static final Logger log = LoggerFactory.getLogger(RequestIdentityAspect.class);

  /** Cached per request: the role already published to the GUCs. */
  private static final String ROLE_CACHE_ATTRIBUTE = "archflux.userRole";

  @PersistenceContext
  private EntityManager entityManager;

  @Before("@annotation(org.springframework.transaction.annotation.Transactional)")
  public void publishRequestIdentity() {
    if (!TransactionSynchronizationManager.isActualTransactionActive()) {
      return;
    }
    HttpServletRequest request = currentRequest();
    if (request == null) {
      return;
    }
    Object value = request.getAttribute(RequestUser.ATTRIBUTE);
    if (!(value instanceof UUID userId)) {
      return;
    }
    try {
      entityManager.createNativeQuery("SELECT set_config('app.current_user_id', :uid, true)")
          .setParameter("uid", userId.toString())
          .getSingleResult();
      String role = cachedRole(request);
      if (role == null) {
        role = lookupRole(userId);
        request.setAttribute(ROLE_CACHE_ATTRIBUTE, role);
      }
      entityManager.createNativeQuery("SELECT set_config('app.current_user_role', :role, true)")
          .setParameter("role", role)
          .getSingleResult();
    } catch (Exception e) {
      // Defense in depth must never break the request: service-layer
      // membership checks still enforce isolation.
      log.debug("Request identity GUC publish skipped: {}", e.getMessage());
    }
  }

  private static HttpServletRequest currentRequest() {
    if (RequestContextHolder.getRequestAttributes()
        instanceof ServletRequestAttributes attributes) {
      return attributes.getRequest();
    }
    return null;
  }

  private static String cachedRole(HttpServletRequest request) {
    Object cached = request.getAttribute(ROLE_CACHE_ATTRIBUTE);
    return cached instanceof String role && !role.isBlank() ? role : null;
  }

  private String lookupRole(UUID userId) {
    try {
      Object role = entityManager.createNativeQuery(
              "SELECT role FROM public.users WHERE id = :uid")
          .setParameter("uid", userId)
          .getSingleResult();
      if (role != null && !role.toString().isBlank()) {
        return role.toString();
      }
    } catch (Exception e) {
      log.debug("Role lookup skipped for {}: {}", userId, e.getMessage());
    }
    return "member";
  }
}
