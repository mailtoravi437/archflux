package com.archflux.domain;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;
import org.hibernate.Session;
import org.hibernate.boot.Metadata;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.hibernate.event.spi.PreInsertEvent;
import org.hibernate.event.spi.PreInsertEventListener;
import org.hibernate.integrator.spi.Integrator;
import org.hibernate.service.spi.SessionFactoryServiceRegistry;

/**
 * Backstop that assigns a personal workspace to {@link Diagram} rows persisted
 * without one (legacy writers, repository-level fixtures). The primary path —
 * {@code WorkspaceService.resolvePersonalWorkspace} called by
 * {@code DiagramService.create} — always sets the workspace explicitly, so
 * this listener is a no-op for normal traffic.
 *
 * <p>Why a Hibernate {@link Integrator} (registered via
 * {@code META-INF/services}, dependency-free): the {@code workspace_id} column
 * is NOT NULL and the mapping is {@code nullable = false}, so Hibernate
 * rejects null workspaces before any SQL runs. Provisioning must therefore
 * happen pre-flush in every Hibernate bootstrap — including
 * {@code @DataJpaTest} slices, where Spring AOP aspects and {@code @Service}
 * beans are unavailable. The listener provisions with plain JDBC on the
 * flush's own connection ({@code Session#doWork}, no Session queries, so no
 * flush recursion), inside the same transaction. The database constraints
 * remain authoritative: provisioning failures fall through and surface as the
 * usual constraint violation.
 */
public class DiagramWorkspaceIntegrator implements Integrator {

  @Override
  public void integrate(Metadata metadata, SessionFactoryImplementor sessionFactory,
      SessionFactoryServiceRegistry serviceRegistry) {
    serviceRegistry.getService(EventListenerRegistry.class)
        .appendListeners(EventType.PRE_INSERT, new ProvisionListener());
  }

  @Override
  public void disintegrate(SessionFactoryImplementor sessionFactory,
      SessionFactoryServiceRegistry serviceRegistry) {
    // No state to clean up.
  }

  static final class ProvisionListener implements PreInsertEventListener {

    @Override
    public boolean onPreInsert(PreInsertEvent event) {
      if (!(event.getEntity() instanceof Diagram diagram) || diagram.getWorkspace() != null) {
        return false;
      }
      UUID ownerId;
      try {
        ownerId = diagram.ownerId();
      } catch (Exception ignored) {
        return false;
      }
      if (ownerId == null) {
        return false;
      }
      UUID workspaceId = provision(event.getSession(), ownerId);
      if (workspaceId == null) {
        return false;
      }
      Workspace reference = event.getSession().byId(Workspace.class).getReference(workspaceId);
      diagram.setWorkspace(reference);
      String[] names = event.getPersister().getPropertyNames();
      Object[] state = event.getState();
      for (int i = 0; i < names.length; i++) {
        if ("workspace".equals(names[i])) {
          state[i] = reference;
          break;
        }
      }
      return false;
    }

    /**
     * Finds the owner's oldest membership workspace, else creates a personal
     * workspace + admin membership. Best-effort: any failure returns null and
     * lets the database constraints speak.
     */
    private UUID provision(Session session, UUID ownerId) {
      final UUID[] result = new UUID[1];
      try {
        session.doWork(connection -> {
          try (PreparedStatement find = connection.prepareStatement(
              "SELECT workspace_id FROM public.workspace_memberships WHERE user_id = ? "
                  + "ORDER BY created_at LIMIT 1")) {
            find.setObject(1, ownerId);
            try (ResultSet rows = find.executeQuery()) {
              if (rows.next()) {
                result[0] = (UUID) rows.getObject(1);
                return;
              }
            }
          }

          String display = "Personal";
          try (PreparedStatement user = connection.prepareStatement(
              "SELECT name FROM public.users WHERE id = ?")) {
            user.setObject(1, ownerId);
            try (ResultSet rows = user.executeQuery()) {
              if (rows.next()) {
                String name = rows.getString(1);
                if (name != null && !name.isBlank()) {
                  display = name + "'s workspace";
                }
              }
            }
          }

          UUID created = UUID.randomUUID();
          try (PreparedStatement insertWorkspace = connection.prepareStatement(
              "INSERT INTO public.workspaces (id, name, plan) VALUES (?, ?, 'member')")) {
            insertWorkspace.setObject(1, created);
            insertWorkspace.setString(2, display);
            insertWorkspace.executeUpdate();
          }
          try (PreparedStatement insertMembership = connection.prepareStatement(
              "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) "
                  + "VALUES (?, ?, 'admin', 'active') ON CONFLICT DO NOTHING")) {
            insertMembership.setObject(1, created);
            insertMembership.setObject(2, ownerId);
            insertMembership.executeUpdate();
          }
          try (PreparedStatement reread = connection.prepareStatement(
              "SELECT workspace_id FROM public.workspace_memberships WHERE user_id = ? "
                  + "ORDER BY created_at LIMIT 1")) {
            reread.setObject(1, ownerId);
            try (ResultSet rows = reread.executeQuery()) {
              if (rows.next()) {
                result[0] = (UUID) rows.getObject(1);
              }
            }
          }
        });
      } catch (Exception ignored) {
        // Best-effort backstop (e.g. pre-V6 schema): fall through to null and
        // let Hibernate / the database report the real problem.
        return null;
      }
      return result[0];
    }
  }
}
