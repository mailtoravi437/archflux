package com.archflux.web;

import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.auth.UserSessionService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import com.archflux.security.AuthFilter;
import com.archflux.service.WorkspaceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Cookie-based session endpoints (PROD-001/PROD-011). The session JWT lives in
 * the {@code ARCHFLUX_TOKEN} cookie (HttpOnly, Path=/, SameSite=Lax, Secure
 * per {@code app.cookie-secure}) and is accepted as a {@code Bearer} fallback.
 * Redirects never carry tokens: success → {@code {frontend}/auth/callback},
 * failure → {@code {frontend}/login?error=<code>}; the frontend then calls
 * {@code GET /api/v1/auth/me} to establish the session.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserRepository userRepository;
    private final UserSessionService sessionService;
    private final MagicLinkService magicLinkService;
    private final JwtService jwtService;
    private final WorkspaceService workspaceService;
    private final OAuth2AuthorizedClientService authorizedClientService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.jwt-secret:dev-secret}")
    private String jwtSecret;

    @Value("${app.cookie-secure:true}")
    private boolean cookieSecure;

    public AuthController(UserRepository userRepository,
                          UserSessionService sessionService,
                          MagicLinkService magicLinkService,
                          JwtService jwtService,
                          WorkspaceService workspaceService,
                          OAuth2AuthorizedClientService authorizedClientService) {
        this.userRepository = userRepository;
        this.sessionService = sessionService;
        this.magicLinkService = magicLinkService;
        this.jwtService = jwtService;
        this.workspaceService = workspaceService;
        this.authorizedClientService = authorizedClientService;
    }

    /**
     * Initiate GitHub OAuth2 login - redirects to GitHub
     */
    @GetMapping("/login/github")
    public ResponseEntity<Void> loginWithGithub(
            @RequestParam(required = false) String redirectUri,
            HttpServletResponse response) throws IOException {
        String targetRedirect = redirectUri != null ? redirectUri : frontendUrl + "/canvas";
        // Store redirect in session
        String oauth2Redirect = "/oauth2/authorization/github?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(oauth2Redirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Initiate Google OAuth2 login - redirects to Google
     */
    @GetMapping("/login/google")
    public ResponseEntity<Void> loginWithGoogle(
            @RequestParam(required = false) String redirectUri,
            HttpServletResponse response) throws IOException {
        String targetRedirect = redirectUri != null ? redirectUri : frontendUrl + "/canvas";
        String oauth2Redirect = "/oauth2/authorization/google?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(oauth2Redirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Initiate SAML2 login - redirects to SAML Identity Provider
     */
    @GetMapping("/login/saml")
    public ResponseEntity<Void> loginWithSaml(
            @RequestParam(required = false) String redirectUri,
            HttpServletResponse response) throws IOException {
        String targetRedirect = redirectUri != null ? redirectUri : frontendUrl + "/canvas";
        String samlRedirect = "/saml2/authorize/archflux?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(samlRedirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Initiate OIDC login - redirects to OIDC Identity Provider
     */
    @GetMapping("/login/oidc")
    public ResponseEntity<Void> loginWithOidc(
            @RequestParam(required = false) String redirectUri,
            @RequestParam(required = false) String provider,
            HttpServletResponse response) throws IOException {
        String targetRedirect = redirectUri != null ? redirectUri : frontendUrl + "/canvas";
        String oidcRedirect = "/oauth2/authorization/" + (provider != null ? provider : "oidc") + "?redirect_uri=" +
            java.net.URLEncoder.encode(targetRedirect, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(oidcRedirect);
        return ResponseEntity.ok().build();
    }

    /**
     * Handle OAuth2 callback success - called by Spring Security after successful login.
     * Sets the ARCHFLUX_TOKEN cookie and redirects with provider only (no token).
     */
    @GetMapping("/success")
    public void handleSuccess(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {

        String email = extractEmail(principal);
        if (email == null || email.isBlank()) {
            log.warn("OAuth2 success with no email attribute from {}", request.getRemoteAddr());
            response.sendRedirect(frontendUrl + "/login?error=no_email");
            return;
        }
        // @AuthenticationPrincipal only carries the OAuth2User (never the token),
        // so recover the registration id from the SecurityContext when available.
        org.springframework.security.core.Authentication auth =
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        final String provider = (auth instanceof OAuth2AuthenticationToken token)
            ? token.getAuthorizedClientRegistrationId()
            : extractProvider(principal);
        String providerId = extractProviderId(principal);
        String accessToken = extractAccessToken(principal);
        String avatarUrl = extractAvatarUrl(principal);
        String displayName = extractDisplayName(principal);

        log.info("OAuth2 success for {} ({}) from {}", email, provider, request.getRemoteAddr());

        // Provision via the SECURITY DEFINER function (login paths run with
        // no RequestUser yet, so direct writes would trip RLS under the app
        // role). provision_login upserts by email, refreshes profile +
        // last_login_at, and ensures a personal workspace.
        UUID userId = workspaceService.provisionLogin(null, email, displayName,
            "member", provider, providerId, avatarUrl, accessToken);
        User user = userRepository.findById(userId).orElseThrow(() ->
            new IllegalStateException("provisioned user missing: " + userId));

        // Create session
        String sessionId = sessionService.createSession(user, request.getRemoteAddr());

        // Mint JWT, set cookie, redirect with provider only (PROD-011: no token in URL)
        String jwt = jwtService.generateToken(user, sessionId);
        addAuthCookie(response, jwt);
        response.sendRedirect(callbackUrl(provider));
    }

    /**
     * Handle OAuth2 failure — redirects with a short error code (no token, no details).
     */
    @GetMapping("/failure")
    public void handleFailure(
            @RequestParam(required = false) String error,
            @RequestParam(required = false) String error_description,
            HttpServletResponse response) throws IOException {
        log.warn("OAuth2 failure: {} - {}", error, error_description);
        String code = (error != null && !error.isBlank()) ? error : "oauth_failed";
        response.sendRedirect(frontendUrl + "/login?error=" +
            java.net.URLEncoder.encode(code, java.nio.charset.StandardCharsets.UTF_8));
    }

    /**
     * Get current authenticated user (cookie or Bearer).
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request) {

        if (principal != null) {
            String email = extractEmail(principal);
            if (email == null || email.isBlank()) {
                return ResponseEntity.status(404).build();
            }
            return userRepository.findByEmailIgnoreCase(email)
                .map(user -> ResponseEntity.ok(userToMap(user)))
                .orElse(ResponseEntity.status(404).build());
        }

        String token = extractCredential(request);
        if (token == null) {
            return unauthenticated();
        }
        try {
            UUID userId = jwtService.getUserId(token);
            return userRepository.findById(userId)
                .map(user -> ResponseEntity.ok(userToMap(user)))
                .orElse(unauthenticated());
        } catch (Exception e) {
            return unauthenticated();
        }
    }

    /**
     * Initiate magic link email login
     */
    @PostMapping("/magic-link")
    public ResponseEntity<Map<String, Object>> sendMagicLink(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        String email = body.get("email");
        if (email == null || !email.contains("@")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Valid email required"));
        }

        String token = magicLinkService.generateMagicLink(email);
        String link = frontendUrl + "/auth/verify?token=" + token;

        // Send email
        magicLinkService.sendMagicLinkEmail(email, link);

        log.info("Magic link sent to {}", email);
        return ResponseEntity.ok(Map.of("message", "Magic link sent to " + email));
    }

    /**
     * Verify magic link token: mint JWT, set cookie, redirect with provider only.
     */
    @GetMapping("/verify")
    public void verifyMagicLink(
            @RequestParam String token,
            HttpServletResponse response) throws IOException {

        Optional<String> emailOpt = magicLinkService.verifyToken(token);

        if (emailOpt.isEmpty()) {
            response.sendRedirect(frontendUrl + "/login?error=invalid_token");
            return;
        }

        String email = emailOpt.get();
        UUID userId = workspaceService.provisionLogin(null, email, null,
            "member", "email", email, null, null);
        User user = userRepository.findById(userId).orElseThrow(() ->
            new IllegalStateException("provisioned user missing: " + userId));

        String sessionId = sessionService.createSession(user, "magic-link");
        String jwt = jwtService.generateToken(user, sessionId);

        addAuthCookie(response, jwt);
        response.sendRedirect(callbackUrl("email"));
    }

    /**
     * Logout: destroy server session, invalidate the HTTP session, and clear
     * the ARCHFLUX_TOKEN cookie.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request,
            HttpServletResponse response) {

        String sessionId = request.getHeader("X-Session-ID");
        if (sessionId == null || sessionId.isBlank()) {
            sessionId = sessionIdFromCredential(request);
        }
        if (sessionId != null && !sessionId.isBlank()) {
            try {
                sessionService.deleteSession(sessionId);
            } catch (Exception e) {
                log.info("Session delete failed (non-fatal): {}", e.getMessage());
            }
        }

        HttpSession session = request.getSession(false);
        if (session != null) {
            try {
                session.invalidate();
            } catch (IllegalStateException ignored) {
                // Already invalidated.
            }
        }

        clearAuthCookie(response);

        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    /**
     * Refresh JWT: validate the incoming credential (cookie or Bearer), mint a
     * new JWT, and reset the cookie.
     */
    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refreshToken(
            HttpServletRequest request,
            HttpServletResponse response) {

        String token = extractCredential(request);
        if (token == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Missing token"));
        }

        try {
            UUID userId = jwtService.getUserId(token);
            String sessionId = jwtService.getSessionIdFromToken(token);
            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty()) {
                return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
            }

            String newToken = jwtService.generateToken(userOpt.get(), sessionId);
            addAuthCookie(response, newToken);
            return ResponseEntity.ok(Map.of("token", newToken));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
        }
    }

    // Cookie + credential helpers

    private void addAuthCookie(HttpServletResponse response, String jwt) {
        ResponseCookie cookie = ResponseCookie.from(AuthFilter.COOKIE_NAME, jwt)
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(Duration.ofSeconds(jwtService.getAccessTokenTtlSeconds()))
            .sameSite("Lax")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void clearAuthCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(AuthFilter.COOKIE_NAME, "")
            .httpOnly(true)
            .secure(cookieSecure)
            .path("/")
            .maxAge(Duration.ZERO)
            .sameSite("Lax")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    /** Credential for controller-level checks: Bearer header or ARCHFLUX_TOKEN cookie. */
    private static String extractCredential(HttpServletRequest request) {
        return AuthFilter.extractJwt(request);
    }

    private String sessionIdFromCredential(HttpServletRequest request) {
        String token = extractCredential(request);
        if (token == null) {
            return null;
        }
        try {
            return jwtService.getSessionIdFromToken(token);
        } catch (Exception e) {
            return null;
        }
    }

    private String callbackUrl(String provider) {
        return frontendUrl + "/auth/callback?provider=" +
            java.net.URLEncoder.encode(provider == null ? "unknown" : provider,
                java.nio.charset.StandardCharsets.UTF_8);
    }

    private static ResponseEntity<Map<String, Object>> unauthenticated() {
        Map<String, Object> inner = new HashMap<>();
        inner.put("code", "UNAUTHENTICATED");
        inner.put("message", "Missing or invalid credential");
        return ResponseEntity.status(401).body(Map.of("error", inner));
    }

    // Principal helpers

    private String extractEmail(Object principal) {
        if (principal instanceof OidcUser oidc) {
            return oidc.getEmail();
        }
        if (principal instanceof OAuth2User oauth2) {
            Object email = oauth2.getAttributes().get("email");
            if (email instanceof String s && !s.isBlank()) return s;
            Object login = oauth2.getAttributes().get("login");
            if (login instanceof String l && !l.isBlank() && l.contains("@")) return l;
        }
        if (principal instanceof org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal saml) {
            for (String key : List.of("email", "Email", "emailaddress", "nameID")) {
                Object v = saml.getAttributes().get(key);
                if (v instanceof String s && !s.isBlank()) return s;
                if (v instanceof java.util.List<?> list && !list.isEmpty() && list.get(0) instanceof String s && !s.isBlank()) return s;
            }
            String name = saml.getName();
            if (name != null && name.contains("@")) return name;
            return null;
        }
        return null;
    }

    private String extractProvider(OAuth2User principal) {
        if (principal instanceof OAuth2AuthenticationToken token) {
            return token.getAuthorizedClientRegistrationId();
        }
        return "unknown";
    }

    private String extractProviderId(OAuth2User principal) {
        return principal.getName();
    }

    private String extractAvatarUrl(OAuth2User principal) {
        for (String key : List.of("avatar_url", "picture", "avatarUrl")) {
            Object value = principal.getAttributes().get(key);
            if (value instanceof String s && !s.isBlank()) {
                return s;
            }
        }
        return null;
    }

    private String extractDisplayName(OAuth2User principal) {
        for (String key : List.of("name", "login", "preferred_username")) {
            Object value = principal.getAttributes().get(key);
            if (value instanceof String s && !s.isBlank()) {
                return s;
            }
        }
        return null;
    }

    private String extractAccessToken(OAuth2User principal) {
        if (principal instanceof OAuth2AuthenticationToken token) {
            String registrationId = token.getAuthorizedClientRegistrationId();
            String principalName = token.getName();
            OAuth2AuthorizedClient authorizedClient = authorizedClientService
                .loadAuthorizedClient(registrationId, principalName);
            if (authorizedClient != null) {
                return authorizedClient.getAccessToken().getTokenValue();
            }
        }
        // For other OAuth2User implementations, try to get from attributes
        return (String) principal.getAttributes().get("access_token");
    }

    private Map<String, Object> userToMap(User user) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", user.getId());
        map.put("email", user.getEmail());
        map.put("name", user.getName());
        map.put("role", user.getRole());
        map.put("provider", user.getProvider());
        map.put("avatarUrl", user.getAvatarUrl());
        map.put("createdAt", user.getCreatedAt());
        return map;
    }
}
