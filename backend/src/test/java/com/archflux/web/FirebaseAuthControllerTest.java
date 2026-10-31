package com.archflux.web;

import com.archflux.ArchfluxApplication;
import com.archflux.PostgresIT;
import com.archflux.auth.MagicLinkService;
import com.archflux.auth.PhoneTokenVerifier;
import com.archflux.auth.UserSessionService;
import com.archflux.repo.UserRepository;
import com.archflux.service.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** R1-SEC-02: POST /api/v1/auth/firebase exchanges a verified Firebase phone ID token for the cookie session. */
@SpringBootTest(classes = ArchfluxApplication.class)
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class FirebaseAuthControllerTest extends PostgresIT {

  private static final String PHONE = "+919876543210";

  @Autowired private MockMvc mockMvc;
  @Autowired private UserRepository users;

  // The verifier double: Google is never called from tests.
  @MockitoBean private PhoneTokenVerifier verifier;
  @MockitoBean private UserSessionService sessions;
  @MockitoBean private MagicLinkService magicLinkService;
  @MockitoBean private OAuth2AuthorizedClientService authorizedClientService;
  @MockitoBean private JwtDecoder jwtDecoder;
  @MockitoBean private org.springframework.security.oauth2.client.registration.ClientRegistrationRepository clientRegistrations;
  @MockitoBean private org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository relyingParties;

  private MvcResult exchange(String token) throws Exception {
    return mockMvc.perform(post("/api/v1/auth/firebase")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"idToken\":\"" + token + "\"}"))
        .andReturn();
  }

  @Test
  void validPhoneTokenCreatesUserSetsCookieAndReturnsTheUser() throws Exception {
    when(verifier.verify("good")).thenReturn(PHONE);
    when(sessions.createSession(any(), anyString())).thenReturn("sess-1");

    MvcResult res = mockMvc.perform(post("/api/v1/auth/firebase")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"idToken\":\"good\"}"))
        .andExpect(status().isOk())
        .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("ARCHFLUX_TOKEN=")))
        .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("HttpOnly")))
        .andExpect(jsonPath("$.data.user.phone").value(PHONE))
        .andExpect(jsonPath("$.data.user.provider").value("phone"))
        .andExpect(jsonPath("$.data.user.email").doesNotExist())
        .andReturn();

    var user = users.findAll().stream().filter(u -> PHONE.equals(u.getPhoneNumber())).findFirst().orElseThrow();
    assertEquals("phone", user.getProvider());
    assertNull(user.getEmail());
    assertTrue(res.getResponse().getContentAsString().contains(user.getId().toString()));
  }

  @Test
  void invalidTokenIs401AndCreatesNothing() throws Exception {
    when(verifier.verify("bad")).thenThrow(
        new ApiException("INVALID_FIREBASE_TOKEN", 401, "Sign-in could not be verified"));
    long before = users.count();

    MvcResult res = mockMvc.perform(post("/api/v1/auth/firebase")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"idToken\":\"bad\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("INVALID_FIREBASE_TOKEN"))
        .andReturn();

    assertNull(res.getResponse().getHeader("Set-Cookie"));
    assertEquals(before, users.count());
    verifyNoInteractions(sessions);
  }

  @Test
  void secondLoginWithTheSamePhoneIsTheSameUser() throws Exception {
    when(verifier.verify("t1")).thenReturn(PHONE);
    when(verifier.verify("t2")).thenReturn(PHONE);
    when(sessions.createSession(any(), anyString())).thenReturn("sess-2");

    String first = exchange("t1").getResponse().getContentAsString();
    long after = users.count();
    String second = exchange("t2").getResponse().getContentAsString();

    assertEquals(after, users.count());
    String id1 = com.jayway.jsonpath.JsonPath.read(first, "$.data.user.id");
    String id2 = com.jayway.jsonpath.JsonPath.read(second, "$.data.user.id");
    assertNotNull(id1);
    assertEquals(id1, id2);
  }

  @Test
  void missingOrBlankTokenIs400() throws Exception {
    mockMvc.perform(post("/api/v1/auth/firebase").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    mockMvc.perform(post("/api/v1/auth/firebase").contentType(MediaType.APPLICATION_JSON)
            .content("{\"idToken\":\"  \"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(verifier);
  }

  @Test
  void notConfiguredIs503() throws Exception {
    when(verifier.verify("x")).thenThrow(
        new ApiException("PHONE_SIGNIN_UNAVAILABLE", 503, "Phone sign-in is not configured"));
    mockMvc.perform(post("/api/v1/auth/firebase").contentType(MediaType.APPLICATION_JSON)
            .content("{\"idToken\":\"x\"}"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.error.code").value("PHONE_SIGNIN_UNAVAILABLE"));
  }
}
