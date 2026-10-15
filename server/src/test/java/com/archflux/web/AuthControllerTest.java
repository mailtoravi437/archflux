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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.spec.SecretKeySpec;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;

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
    }

    @Test
    void testGetCurrentUserWithJwt() throws Exception {
        // Create JWT token
        String token = "test.jwt.token";
        
        // Mock JWT claims
        var claims = io.jsonwebtoken.Jwts.claims()
            .subject(testUserId.toString())
            .add("email", testEmail)
            .add("role", "member")
            .build();
        when(jwtService.validateToken(token)).thenReturn(claims);

        mockMvc.perform(get("/api/v1/auth/me")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value(testEmail));
    }

    @Test
    void testGetCurrentUserUnauthorized() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me"))
            .andExpect(status().isUnauthorized());
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
        when(jwtService.generateToken(any(), anyString())).thenReturn("generated-jwt-token");

        mockMvc.perform(get("/api/v1/auth/verify")
                .param("token", token))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("**/auth/callback*"));
    }

    @Test
    void testVerifyMagicLinkInvalidToken() throws Exception {
        when(magicLinkService.verifyToken(anyString())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/auth/verify")
                .param("token", "invalid-token"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("**/login*"));
    }

    @Test
    void testLogout() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout")
                .header("X-Session-ID", "test-session-id"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.message").value("Logged out successfully"));
    }

    @Test
    void testRefreshToken() throws Exception {
        String token = "valid.jwt.token";
        var claims = io.jsonwebtoken.Jwts.claims()
            .subject(testUserId.toString())
            .add("sessionId", "test-session")
            .build();
        when(jwtService.validateToken(token)).thenReturn(claims);
        when(jwtService.generateToken(any(), anyString())).thenReturn("new-jwt-token");

        mockMvc.perform(post("/api/v1/auth/refresh")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("new-jwt-token"));
    }

    @Test
    void testRefreshTokenInvalid() throws Exception {
        when(jwtService.validateToken(anyString())).thenThrow(new RuntimeException("Invalid token"));

        mockMvc.perform(post("/api/v1/auth/refresh")
                .header("Authorization", "Bearer invalid.token"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Invalid token"));
    }

    @Test
    void testOAuth2SuccessHandler() throws Exception {
        // Create mock OAuth2 user
        Map<String, Object> attributes = Map.of(
            "email", "oauth@test.com",
            "name", "OAuth User",
            "id", "98765"
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
        com.archflux.web.AuthController controller = new com.archflux.web.AuthController(
            userRepository, userSessionService, magicLinkService, jwtService, authorizedClientService);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "frontendUrl", "http://localhost:5173");
        var httpReq = mock(jakarta.servlet.http.HttpServletRequest.class);
        when(httpReq.getRemoteAddr()).thenReturn("127.0.0.1");
        var httpRes = new org.springframework.mock.web.MockHttpServletResponse();
        controller.handleSuccess(oauth2User, httpReq, httpRes);

        var redirected = httpRes.getRedirectedUrl();
        assert redirected != null && redirected.contains("/auth/callback")
            : "expected callback redirect, got: " + redirected;

        // Verify user was created/updated (real repository — assert DB state)
        var saved = userRepository.findByEmailIgnoreCase("oauth@test.com");
        assert saved.isPresent() : "OAuth user should be persisted";
        verify(jwtService).generateToken(any(User.class), any());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }
}