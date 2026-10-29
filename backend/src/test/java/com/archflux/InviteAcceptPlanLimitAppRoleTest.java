package com.archflux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import com.archflux.auth.JwtService;
import com.archflux.domain.User;
import com.archflux.security.ShareTokens;

/**
 * R1-E11 plan-enforcement gap: the whole backend runs as the production role
 * {@code archflux_app} (RLS enforced). An invitee is not a member yet, so a plain
 * membership count under RLS returns 0 and the editor seat limit was skipped on accept.
 * Accepting an editor invite into a full free workspace must return 402 LIMIT_REACHED
 * and must not add the membership.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
class InviteAcceptPlanLimitAppRoleTest {

  private static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17-alpine");

  static {
    AppRoleTest.ensureDockerHost();
    DB.start();
    try (Connection owner = DB.createConnection("")) {
      var files = Files.list(MigrationFiles.dir())
          .map(p -> p.getFileName().toString())
          .filter(n -> n.matches("V\\d+__.*\\.sql"))
          .sorted(MigrationFiles.BY_VERSION).toList();
      for (String f : files) {
        exec(owner, Files.readString(MigrationFiles.dir().resolve(f)));
      }
      // Fresh environment order: roles.sql runs after the migrations.
      exec(owner, Files.readString(Path.of(System.getProperty("user.dir"), "db", "roles.sql"))
          .replace(":'MIGRATOR_PASSWORD'", "'migrator-pw-123'")
          .replace(":'APP_PASSWORD'", "'app-pw-123'"));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  @DynamicPropertySource
  static void props(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", DB::getJdbcUrl);
    registry.add("spring.datasource.username", () -> "archflux_app");
    registry.add("spring.datasource.password", () -> "app-pw-123");
  }

  @Autowired private MockMvc mockMvc;
  @Autowired private JwtService jwtService;

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

  private static void user(Connection c, UUID id, String email) throws Exception {
    exec(c, "INSERT INTO public.users (id, email, name, role, provider) VALUES ('" + id + "', '"
        + email + "', 'U', 'member', 'email')");
  }

  @Test
  void acceptingEditorInviteIntoFullFreeWorkspaceReturns402UnderAppRole() throws Exception {
    UUID admin = UUID.randomUUID();
    UUID editor1 = UUID.randomUUID();
    UUID editor2 = UUID.randomUUID();
    UUID invitee = UUID.randomUUID();
    UUID ws = UUID.randomUUID();
    String email = "invitee-" + invitee + "@archflux.local";
    String token = ShareTokens.generate();

    try (Connection owner = DB.createConnection("")) {
      user(owner, admin, "adm-" + admin + "@archflux.local");
      user(owner, editor1, "e1-" + editor1 + "@archflux.local");
      user(owner, editor2, "e2-" + editor2 + "@archflux.local");
      user(owner, invitee, email);
      exec(owner, "INSERT INTO public.workspaces (id, name, plan) VALUES ('" + ws
          + "', 'Full', 'free')");
      exec(owner, "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) "
          + "VALUES ('" + ws + "', '" + admin + "', 'admin', 'active'), ('" + ws + "', '" + editor1
          + "', 'editor', 'active'), ('" + ws + "', '" + editor2 + "', 'editor', 'active')");
      exec(owner, "INSERT INTO public.workspace_invites (id, workspace_id, email, role, token_hash, "
          + "invited_by, expires_at) VALUES ('" + UUID.randomUUID() + "', '" + ws + "', '" + email
          + "', 'editor', '" + ShareTokens.hash(token) + "', '" + admin
          + "', now() + interval '7 days')");
    }

    User u = new User(invitee, email, "Invitee", "member");
    u.setProvider("email");
    String jwt = "Bearer " + jwtService.generateToken(u, "session-" + UUID.randomUUID());

    mockMvc.perform(post("/api/v1/invites/" + token + "/accept").header("Authorization", jwt))
        .andExpect(status().isPaymentRequired())
        .andExpect(jsonPath("$.error.code").value("LIMIT_REACHED"));

    try (Connection owner = DB.createConnection("")) {
      assertThat(count(owner, "SELECT COUNT(*) FROM public.workspace_memberships WHERE "
          + "workspace_id = '" + ws + "' AND user_id = '" + invitee + "'")).isZero();
      assertThat(count(owner, "SELECT COUNT(*) FROM public.workspace_invites WHERE "
          + "workspace_id = '" + ws + "' AND accepted_at IS NOT NULL")).isZero();
    }
  }
}
