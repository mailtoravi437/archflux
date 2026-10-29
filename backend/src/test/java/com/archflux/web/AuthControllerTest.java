package com.archflux.web;

import com.archflux.ArchfluxApplication;
import com.archflux.PostgresIT;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.archflux.service.DiagramService;
import com.archflux.service.SyncService;
import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.auth.UserSessionService;
import com.archflux.repo.AuditEventRepository;
import com.archflux.service.AuditService;
import com.archflux.service.WorkspaceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = ArchfluxApplication.class)
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class AuthControllerTest extends PostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @MockitoBean
    private DiagramService diagramService;

    @MockitoBean
    private SyncService syncService;

    @MockitoBean
    private JwtService jwtService;

    @MockitoBean
    private MagicLinkService magicLinkService;

    @MockitoBean
    private UserSessionService userSessionService;

    @MockitoBean
    private OAuth2AuthorizedClientService authorizedClientService;

    // Real bean on purpose: the OAuth tests exercise the actual
    // SECURITY DEFINER provisioning path (user + workspace), not a mock.
    @Autowired
    private WorkspaceService workspaceService;

    @Autowired
    private AuditEventRepository auditEvents;

    @Autowired
    private org.springframework.context.ApplicationContext applicationContext;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private org.springframework.security.oauth2.client.registration.ClientRegistrationRepository clientRegistrationRepository;

    @MockitoBean
    private org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository relyingPartyRegistrationRepository;

    private UUID testUserId;
    private String testEmail = "test@example.com";

    @BeforeEach
    void setUp() {
        // Create test user
        User user = new User();
        user.setEmail(testEmail);
        user.setName("Test User");
        user.setProvider("github");
        user.setProviderId("12345");
        user.setRole("member");
        user = userRepository.saveAndFlush(user);
        testUserId = user.getId();
        when(magicLinkService.allowSend(anyString())).thenReturn(true);
    }

    private com.archflux.web.AuthController controllerWithDevCookies(
            com.archflux.web.AuthController controller) {
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "frontendUrl", "http://localhost:5173");
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "cookieSecure", false);
        return controller;
    }

    @Test
    void testGetCurrentUserWithJwt() throws Exception {
        String token = "test.jwt.token";
        when(jwtService.getUserId(token)).thenReturn(testUserId);

        mockMvc.perform(get("/api/v1/auth/me")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value(testEmail))
            .andExpect(jsonPath("$.id").value(testUserId.toString()))
            .andExpect(jsonPath("$.name").value("Test User"))
            .andExpect(jsonPath("$.role").value("member"))
            .andExpect(jsonPath("$.provider").value("github"));
    }

    @Test
    void testGetCurrentUserWithCookie() throws Exception {
        String token = "cookie.jwt.token";
        when(jwtService.getUserId(token)).thenReturn(testUserId);

        mockMvc.perform(get("/api/v1/auth/me")
                .cookie(new jakarta.servlet.http.Cookie("ARCHFLUX_TOKEN", token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value(testEmail));
    }

    @Test
    void testGetCurrentUserUnauthorized() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }

    @Test
    void testGetCurrentUserGarbageJwt() throws Exception {
        when(jwtService.getUserId(anyString())).thenThrow(new RuntimeException("bad signature"));

        mockMvc.perform(get("/api/v1/auth/me")
                .header("Authorization", "Bearer garbage.jwt.token"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }

    @Test
    void testSendMagicLink() throws Exception {
        when(magicLinkService.generateMagicLink(anyString())).thenReturn("test-token");
        doNothing().when(magicLinkService).sendMagicLinkEmail(anyString(), anyString());

        mockMvc.perform(post("/api/v1/auth/magic-link")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"test@example.com\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Magic link sent to test@example.com"));
        // SERVICES_SPEC §4.1 (SVC-G7): the emailed link targets the API verify
        // endpoint, never an SPA path.
        verify(magicLinkService).sendMagicLinkEmail(eq("test@example.com"),
            argThat(link -> link.endsWith("/api/v1/auth/verify?token=test-token") && !link.contains("#")));
    }

    @Test
    void magicLinkUsesConfiguredPublicApiUrl() throws Exception {
        com.archflux.web.AuthController controller = applicationContext.getBean(com.archflux.web.AuthController.class);
        Object previous = org.springframework.test.util.ReflectionTestUtils.getField(controller, "publicApiUrl");
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "publicApiUrl", "https://api.example.com/api/");
        try {
            when(magicLinkService.generateMagicLink(anyString())).thenReturn("tok");
            mockMvc.perform(post("/api/v1/auth/magic-link")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"test@example.com\"}"))
                .andExpect(status().isOk());
            verify(magicLinkService).sendMagicLinkEmail("test@example.com",
                "https://api.example.com/api/v1/auth/verify?token=tok");
        } finally {
            org.springframework.test.util.ReflectionTestUtils.setField(controller, "publicApiUrl", previous);
        }
    }

    @Test
    void loginInitiationUsesConfiguredAuthorizationEndpoints() throws Exception {
        // Must match SecurityConfig authorizationEndpoint baseUri and the SAML2 default (SVC-G16).
        mockMvc.perform(get("/api/v1/auth/login/github"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("/oauth2/authorize/github*"));
        mockMvc.perform(get("/api/v1/auth/login/saml"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("/saml2/authenticate/archflux*"));
    }

    @Test
    void testSendMagicLinkInvalidEmail() throws Exception {
        mockMvc.perform(post("/api/v1/auth/magic-link")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"invalid-email\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Valid email required"));
    }

    @Test
    void testVerifyMagicLink() throws Exception {
        String token = "test-magic-link-token";
        when(magicLinkService.verifyToken(token)).thenReturn(Optional.of(testEmail));
        when(userSessionService.createSession(any(User.class), any())).thenReturn("test-session");
        when(jwtService.generateToken(any(User.class), anyString())).thenReturn("generated-jwt-token");

        MvcResult result = mockMvc.perform(get("/api/v1/auth/verify")
                .param("token", token))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("http://localhost:5173/#/auth/callback?provider=email"))
            .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("ARCHFLUX_TOKEN=generated-jwt-token")))
            .andReturn();

        String location = result.getResponse().getRedirectedUrl();
        assertNotNull(location);
        assertFalse(location.contains("token="), "redirect must not carry a token: " + location);
        String setCookie = result.getResponse().getHeader("Set-Cookie");
        assertNotNull(setCookie);
        assertTrue(setCookie.contains("HttpOnly"), "cookie must be HttpOnly: " + setCookie);
        assertTrue(setCookie.contains("Path=/"), "cookie must set Path=/: " + setCookie);
        assertTrue(setCookie.contains("SameSite=Lax"), "cookie must be SameSite=Lax: " + setCookie);
    }

    @Test
    void testVerifyMagicLinkInvalidToken() throws Exception {
        when(magicLinkService.verifyToken(anyString())).thenReturn(Optional.empty());

        MvcResult result = mockMvc.perform(get("/api/v1/auth/verify")
                .param("token", "invalid-token"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("http://localhost:5173/#/login?error=invalid_token"))
            .andReturn();

        assertTrue(result.getResponse().getHeader("Set-Cookie") == null
            || !result.getResponse().getHeader("Set-Cookie").contains("ARCHFLUX_TOKEN="));
    }

    @Test
    void testLogout() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/logout")
                .header("X-Session-ID", "test-session-id"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Logged out successfully"))
            .andReturn();

        // X-Session-ID is ignored: only the caller's own credential session is revoked (SVC-G26).
        verify(userSessionService, never()).revokeSession("test-session-id");
        verify(userSessionService, never()).deleteSession("test-session-id");
        String setCookie = result.getResponse().getHeader("Set-Cookie");
        assertNotNull(setCookie, "logout must clear the auth cookie");
        assertTrue(setCookie.contains("ARCHFLUX_TOKEN="), "must clear ARCHFLUX_TOKEN: " + setCookie);
        assertTrue(setCookie.contains("Max-Age=0"), "cleared cookie must expire immediately: " + setCookie);
        assertTrue(setCookie.contains("Path=/"), "cleared cookie must keep Path=/: " + setCookie);
        assertTrue(setCookie.contains("SameSite=Lax"), "cleared cookie must keep SameSite: " + setCookie);
    }

    @Test
    void testLogoutViaJwtSession() throws Exception {
        String token = "valid.jwt.token";
        when(jwtService.getSessionIdFromToken(token)).thenReturn("jwt-session-9");

        mockMvc.perform(post("/api/v1/auth/logout")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Logged out successfully"));

        verify(userSessionService).revokeSession("jwt-session-9");
    }

    @Test
    void testRefreshToken() throws Exception {
        String token = "valid.jwt.token";
        when(jwtService.getUserId(token)).thenReturn(testUserId);
        when(jwtService.getSessionIdFromToken(token)).thenReturn("test-session");
        when(jwtService.generateToken(any(), anyString())).thenReturn("new-jwt-token");
        when(jwtService.getAccessTokenTtlSeconds()).thenReturn(3600L);

        MvcResult result = mockMvc.perform(post("/api/v1/auth/refresh")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("new-jwt-token"))
            .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("ARCHFLUX_TOKEN=new-jwt-token")))
            .andReturn();

        String setCookie = result.getResponse().getHeader("Set-Cookie");
        assertNotNull(setCookie);
        assertTrue(setCookie.contains("HttpOnly"));
        assertTrue(setCookie.contains("SameSite=Lax"));
    }

    @Test
    void testRefreshTokenViaCookie() throws Exception {
        String token = "cookie.jwt.token";
        when(jwtService.getUserId(token)).thenReturn(testUserId);
        when(jwtService.getSessionIdFromToken(token)).thenReturn("test-session");
        when(jwtService.generateToken(any(), anyString())).thenReturn("rotated-jwt");
        when(jwtService.getAccessTokenTtlSeconds()).thenReturn(3600L);

        mockMvc.perform(post("/api/v1/auth/refresh")
                .cookie(new jakarta.servlet.http.Cookie("ARCHFLUX_TOKEN", token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("rotated-jwt"))
            .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("ARCHFLUX_TOKEN=rotated-jwt")));
    }

    @Test
    void testRefreshTokenInvalid() throws Exception {
        when(jwtService.getUserId(anyString())).thenThrow(new RuntimeException("Invalid token"));

        mockMvc.perform(post("/api/v1/auth/refresh")
                .header("Authorization", "Bearer invalid.token"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Invalid token"));
    }

    @Test
    void testRefreshTokenMissing() throws Exception {
        mockMvc.perform(post("/api/v1/auth/refresh"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Missing token"));
    }

    @Test
    void testOAuth2SuccessHandler() throws Exception {
        // Create mock OAuth2 user
        Map<String, Object> attributes = Map.of(
            "email", "oauth@test.com",
            "name", "OAuth User",
            "id", "98765",
            "avatar_url", "https://avatars.example.com/u/98765"
        );
        DefaultOAuth2User oauth2User = new DefaultOAuth2User(
            Collections.emptyList(), attributes, "email"
        );

        // Mock authorized client
        OAuth2AuthorizedClient authorizedClient = mock(OAuth2AuthorizedClient.class);
        when(authorizedClient.getAccessToken()).thenReturn(
            new org.springframework.security.oauth2.core.OAuth2AccessToken(
                org.springframework.security.oauth2.core.OAuth2AccessToken.TokenType.BEARER,
                "github-access-token",
                java.time.Instant.now(),
                java.time.Instant.now().plusSeconds(3600)
            )
        );
        when(authorizedClientService.loadAuthorizedClient(eq("github"), eq("oauth@test.com")))
            .thenReturn(authorizedClient);

        // Create OAuth2AuthenticationToken
        OAuth2AuthenticationToken authToken = new OAuth2AuthenticationToken(
            oauth2User,
            Collections.emptyList(),
            "github"
        );

        // Exercise the handler directly: with addFilters=false the MVC
        // AuthenticationPrincipal resolver does not populate @AuthenticationPrincipal,
        // so call the controller method with the resolved principal instead.
        // Publish the token in the SecurityContext so provider resolution works.
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(authToken);
        try {
        when(userSessionService.createSession(any(User.class), any())).thenReturn("test-session");
        when(jwtService.generateToken(any(User.class), any())).thenReturn("test-jwt");
        when(jwtService.getAccessTokenTtlSeconds()).thenReturn(3600L);
        com.archflux.web.AuthController controller = controllerWithDevCookies(
            new com.archflux.web.AuthController(
                userRepository, userSessionService, magicLinkService, jwtService, workspaceService, new AuditService(auditEvents), authorizedClientService));
        var httpReq = mock(jakarta.servlet.http.HttpServletRequest.class);
        when(httpReq.getRemoteAddr()).thenReturn("127.0.0.1");
        var httpRes = new org.springframework.mock.web.MockHttpServletResponse();
        controller.handleSuccess(oauth2User, httpReq, httpRes);

        var redirected = httpRes.getRedirectedUrl();
        assertNotNull(redirected);
        assertTrue(redirected.contains("/auth/callback"),
            "expected callback redirect, got: " + redirected);
        assertTrue(redirected.contains("provider=github"),
            "expected provider in redirect, got: " + redirected);
        assertFalse(redirected.contains("token="),
            "redirect must not carry a token, got: " + redirected);

        String setCookie = httpRes.getHeader("Set-Cookie");
        assertNotNull(setCookie, "OAuth success must set the auth cookie");
        assertTrue(setCookie.contains("ARCHFLUX_TOKEN=test-jwt"), "unexpected Set-Cookie: " + setCookie);
        assertTrue(setCookie.contains("HttpOnly"), "unexpected Set-Cookie: " + setCookie);
        assertTrue(setCookie.contains("SameSite=Lax"), "unexpected Set-Cookie: " + setCookie);

        // Verify user was created/updated (real repository — assert DB state)
        var saved = userRepository.findByEmailIgnoreCase("oauth@test.com");
        assertTrue(saved.isPresent(), "OAuth user should be persisted");
        assertTrue("https://avatars.example.com/u/98765".equals(saved.get().getAvatarUrl()),
            "avatar should be stored, got: " + saved.get().getAvatarUrl());
        verify(jwtService).generateToken(any(User.class), any());
        // Login is audited with actor + outcome (PROD-009).
        assertTrue(auditEvents.findByActionOrderByCreatedAtDesc(
                "auth.login",
                org.springframework.data.domain.PageRequest.of(0, 10)).stream()
            .anyMatch(e -> "ok".equals(e.getOutcome())
                && saved.get().getId().toString().equals(e.getActorId().toString())),
            "expected an ok auth.login audit event for the OAuth user");
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    void testOAuth2SuccessWithoutEmail() throws Exception {
        Map<String, Object> attributes = Map.of("id", "no-email-id", "login", "ghost");
        DefaultOAuth2User oauth2User = new DefaultOAuth2User(
            Collections.emptyList(), attributes, "id"
        );

        com.archflux.web.AuthController controller = controllerWithDevCookies(
            new com.archflux.web.AuthController(
                userRepository, userSessionService, magicLinkService, jwtService, workspaceService, new AuditService(auditEvents), authorizedClientService));
        var httpReq = mock(jakarta.servlet.http.HttpServletRequest.class);
        when(httpReq.getRemoteAddr()).thenReturn("127.0.0.1");
        var httpRes = new org.springframework.mock.web.MockHttpServletResponse();
        controller.handleSuccess(oauth2User, httpReq, httpRes);

        assertTrue(httpRes.getRedirectedUrl() != null
            && httpRes.getRedirectedUrl().contains("/login?error=no_email"),
            "expected no_email redirect, got: " + httpRes.getRedirectedUrl());
    }

    @Test
    void refreshRejectsRevokedSession() throws Exception {
        String token = "logged.out.token";
        when(jwtService.getUserId(token)).thenReturn(testUserId);
        when(jwtService.getSessionIdFromToken(token)).thenReturn("revoked-session");
        when(userSessionService.isRevoked("revoked-session")).thenReturn(true);

        mockMvc.perform(post("/api/v1/auth/refresh")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isUnauthorized());
        verify(jwtService, never()).generateToken(any(), anyString());
    }

    @Test
    void magicLinkCappedPerAddress() throws Exception {
        when(magicLinkService.allowSend("flood@example.com")).thenReturn(false);
        mockMvc.perform(post("/api/v1/auth/magic-link")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"email\":\"flood@example.com\"}"))
            .andExpect(status().isTooManyRequests());
        verify(magicLinkService, never()).sendMagicLinkEmail(eq("flood@example.com"), anyString());
    }

    @Test
    void meRejectsRevokedSession() throws Exception {
        String token = "logged.out.me";
        when(jwtService.getUserId(token)).thenReturn(testUserId);
        when(jwtService.getSessionIdFromToken(token)).thenReturn("revoked-me");
        when(userSessionService.isRevoked("revoked-me")).thenReturn(true);
        mockMvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isUnauthorized());
    }
}
