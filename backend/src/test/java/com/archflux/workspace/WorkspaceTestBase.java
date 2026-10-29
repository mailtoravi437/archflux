package com.archflux.workspace;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.PostgresIT;
import com.archflux.TestInfraMocks;
import com.archflux.auth.JwtService;
import com.archflux.domain.User;
import com.archflux.domain.Workspace;
import com.archflux.repo.UserRepository;
import com.archflux.service.WorkspaceService;

/** Shared fixtures for the R1-E11-T01 tests. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
abstract class WorkspaceTestBase extends PostgresIT {

  @Autowired protected MockMvc mockMvc;
  @Autowired protected JwtService jwtService;
  @Autowired protected UserRepository users;
  @Autowired protected WorkspaceService workspaceService;

  protected User persistUser(String prefix) {
    User user = new User(UUID.randomUUID(), prefix + "-" + UUID.randomUUID() + "@archflux.local",
        prefix, "member");
    user.setProvider("email");
    return users.saveAndFlush(user);
  }

  protected Workspace personal(User user) {
    return workspaceService.resolvePersonalWorkspace(user.getId());
  }

  protected String jwt(User user) {
    return "Bearer " + jwtService.generateToken(user, "session-" + UUID.randomUUID());
  }

  protected MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, String jwt,
      String body) {
    return b.header("Authorization", jwt).contentType(MediaType.APPLICATION_JSON).content(body);
  }
}
