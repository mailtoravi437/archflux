package com.archflux.sharing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.TestInfraMocks;
import com.archflux.domain.User;

/** R1-E07-T02: diagram members endpoints. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfraMocks.class)
@Transactional
class ShareMembersTest extends SharingIT {

  private String id;
  private String url;

  @BeforeEach
  void setUp() throws Exception {
    setUpPeople("share");
    id = createDiagram(aliceJwt, "Payments");
    url = "/api/v1/diagrams/" + id + "/members";
  }

  private String add(String email, String role) {
    return "{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}";
  }

  @Test
  void addWorkspaceMemberByEmail() throws Exception {
    try (LogCapture logs = new LogCapture()) {
      mockMvc.perform(json(post(url), aliceJwt, add(reviewer.getEmail().toUpperCase(), "editor")))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.data.userId", is(reviewer.getId().toString())))
          .andExpect(jsonPath("$.data.email", is(reviewer.getEmail())))
          .andExpect(jsonPath("$.data.name", is("Rita")))
          .andExpect(jsonPath("$.data.role", is("editor")));
      // Notified through EmailService (the mock sender in tests).
      assertThat(logs.everything())
          .contains("MOCK EMAIL sent to " + reviewer.getEmail() + ": Alice shared Payments with you");
    }
    // The explicit editor row now beats the reviewer workspace role.
    mockMvc.perform(json(put("/api/v1/diagrams/" + id), reviewerJwt, "{\"title\":\"P2\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(get(url).header("Authorization", aliceJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()", is(2)))
        .andExpect(jsonPath("$.data[*].role", hasItem("owner")));
    // Adding again updates the role (200, not a duplicate).
    mockMvc.perform(json(post(url), aliceJwt, add(reviewer.getEmail(), "viewer")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("viewer")));
    assertThat(auditActions(aliceWs.getId())).contains("share.member_add", "share.member_role");

    // Invalid input: 400.
    mockMvc.perform(json(post(url), aliceJwt, add("not-an-email", "viewer")))
        .andExpect(status().isBadRequest());
    mockMvc.perform(json(post(url), aliceJwt, add(reviewer.getEmail(), "superuser")))
        .andExpect(status().isBadRequest());
    // No token: 401. Another workspace: 404.
    mockMvc.perform(json(post(url), null, add(reviewer.getEmail(), "viewer")))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(json(post(url), bobJwt, add(bob.getEmail(), "owner")))
        .andExpect(status().isNotFound());
    mockMvc.perform(get(url).header("Authorization", bobJwt))
        .andExpect(status().isNotFound());
  }

  @Test
  void nonWorkspaceEmailIs422() throws Exception {
    for (String email : new String[] {bob.getEmail(), "nobody-" + id + "@archflux.local"}) {
      mockMvc.perform(json(post(url), aliceJwt, add(email, "viewer")))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.error.code", is("USER_NOT_FOUND")))
          .andExpect(jsonPath("$.error.message", is("Invite them to the workspace first")));
    }
  }

  @Test
  void editorCannotGrantOwner() throws Exception {
    mockMvc.perform(json(post(url), editorJwt, add(viewer.getEmail(), "owner")))
        .andExpect(status().isForbidden());
    mockMvc.perform(json(post(url), editorJwt, add(viewer.getEmail(), "editor")))
        .andExpect(status().isCreated());
    mockMvc.perform(json(put(url + "/" + viewer.getId()), editorJwt, "{\"role\":\"owner\"}"))
        .andExpect(status().isForbidden());
    // Editors may not demote or remove an owner.
    mockMvc.perform(json(put(url + "/" + alice.getId()), editorJwt, "{\"role\":\"viewer\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(delete(url + "/" + alice.getId()).header("Authorization", editorJwt))
        .andExpect(status().isForbidden());
    // Owners can grant owner.
    mockMvc.perform(json(put(url + "/" + viewer.getId()), aliceJwt, "{\"role\":\"owner\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role", is("owner")));
    mockMvc.perform(json(put(url + "/" + viewer.getId()), aliceJwt, "{\"role\":\"boss\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void lastOwnerRemovalIs409() throws Exception {
    mockMvc.perform(delete(url + "/" + alice.getId()).header("Authorization", aliceJwt))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("LAST_OWNER")));
    mockMvc.perform(json(put(url + "/" + alice.getId()), aliceJwt, "{\"role\":\"editor\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code", is("LAST_OWNER")));
    // With a second owner, the first can step down and then be removed.
    mockMvc.perform(json(post(url), aliceJwt, add(editor.getEmail(), "owner")))
        .andExpect(status().isCreated());
    mockMvc.perform(json(put(url + "/" + alice.getId()), aliceJwt, "{\"role\":\"editor\"}"))
        .andExpect(status().isOk());
    mockMvc.perform(delete(url + "/" + alice.getId()).header("Authorization", editorJwt))
        .andExpect(status().isNoContent());
    mockMvc.perform(delete(url + "/" + editor.getId()).header("Authorization", editorJwt))
        .andExpect(status().isConflict());
    mockMvc.perform(delete(url + "/" + java.util.UUID.randomUUID()).header("Authorization", editorJwt))
        .andExpect(status().isNotFound());
    assertThat(auditActions(aliceWs.getId())).contains("share.member_remove");
  }

  @Test
  void viewerCanListMembersButNotChange() throws Exception {
    User extra = viewer;
    mockMvc.perform(get(url).header("Authorization", viewerJwt))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].userId", is(alice.getId().toString())))
        .andExpect(jsonPath("$.data[0].role", is("owner")));
    mockMvc.perform(json(post(url), viewerJwt, add(extra.getEmail(), "viewer")))
        .andExpect(status().isForbidden());
    mockMvc.perform(json(put(url + "/" + alice.getId()), viewerJwt, "{\"role\":\"viewer\"}"))
        .andExpect(status().isForbidden());
    mockMvc.perform(delete(url + "/" + alice.getId()).header("Authorization", viewerJwt))
        .andExpect(status().isForbidden());
    // Commenters (workspace reviewers) can't share either.
    mockMvc.perform(json(post(url), reviewerJwt, add(extra.getEmail(), "viewer")))
        .andExpect(status().isForbidden());
  }
}
