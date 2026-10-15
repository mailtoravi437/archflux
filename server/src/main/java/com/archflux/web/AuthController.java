package com.archflux.web;

import com.archflux.auth.JwtService;
import com.archflux.auth.MagicLinkService;
import com.archflux.auth.UserSessionService;
import com.archflux.domain.User;
import com.archflux.repo.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserRepository userRepository;
    private final UserSessionService sessionService;
    private final MagicLinkService magicLinkService;
    private final JwtService jwtService;
    private final OAuth2AuthorizedClientService authorizedClientService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.jwt-secret:dev-secret}")
    private String jwtSecret;

    public AuthController(UserRepository userRepository,
                          UserSessionService sessionService,
                          MagicLinkService magicLinkService,
                          JwtService jwtService,
                          OAuth2AuthorizedClientService authorizedClientService) {
        this.userRepository = userRepository;
        this.sessionService = sessionService;
        this.magicLinkService = magicLinkService;
        this.jwtService = jwtService;
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
     * Handle OAuth2 callback success - called by Spring Security after successful login
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

        log.info("OAuth2 success for {} ({}) from {}", email, provider, request.getRemoteAddr());

        // Get or create user
        User user = userRepository.findByEmailIgnoreCase(email)
            .orElseGet(() -> createUser(email, provider, providerId, accessToken));

        // Update user info
        user.setProvider(provider);
        user.setProviderId(providerId);
        user.setAccessToken(accessToken);
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        // Create session
        String sessionId = sessionService.createSession(user, request.getRemoteAddr());

        // Generate JWT for frontend
        String jwt = jwtService.generateToken(user, sessionId);

        // Redirect to frontend with token
        String redirectUrl = UriComponentsBuilder.fromHttpUrl(frontendUrl + "/auth/callback")
            .queryParam("token", jwt)
            .queryParam("provider", provider)
            .build().toUriString();

        response.sendRedirect(redirectUrl);
    }

    /**
     * Handle OAuth2 failure
     */
    @GetMapping("/failure")
    public void handleFailure(
            @RequestParam(required = false) String error,
            @RequestParam(required = false) String error_description,
            HttpServletResponse response) throws IOException {
        log.warn("OAuth2 failure: {} - {}", error, error_description);
        String redirectUrl = frontendUrl + "/login?error=" + 
            java.net.URLEncoder.encode(error_description != null ? error_description : error, 
                java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(redirectUrl);
    }

    /**
     * Get current authenticated user
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request) {
        
        if (principal == null) {
            // Check for JWT token in header
            String authHeader = request.getHeader("Authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                try {
                    var claims = jwtService.validateToken(token);
                    String userId = claims.getSubject();
                    return userRepository.findById(UUID.fromString(userId))
                        .map(user -> ResponseEntity.ok(userToMap(user)))
                        .orElse(ResponseEntity.status(401).build());
                } catch (Exception e) {
                    return ResponseEntity.status(401).build();
                }
            }
            return ResponseEntity.status(401).build();
        }

        String email = extractEmail(principal);
        if (email == null || email.isBlank()) {
            return ResponseEntity.status(404).build();
        }
        return userRepository.findByEmailIgnoreCase(email)
            .map(user -> ResponseEntity.ok(userToMap(user)))
            .orElse(ResponseEntity.status(404).build());
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
     * Verify magic link token
     */
    @GetMapping("/verify")
    public void verifyMagicLink(
            @RequestParam String token,
            HttpServletResponse response) throws IOException {
        
        Optional<String> emailOpt = magicLinkService.verifyToken(token);
        String redirectUrl;
        
        if (emailOpt.isEmpty()) {
            redirectUrl = frontendUrl + "/login?error=invalid_token";
            response.sendRedirect(redirectUrl);
            return;
        }

        String email = emailOpt.get();
        User user = userRepository.findByEmailIgnoreCase(email)
            .orElseGet(() -> createUser(email, "email", email, null));

        String sessionId = sessionService.createSession(user, "magic-link");
        String jwt = jwtService.generateToken(user, sessionId);

        redirectUrl = UriComponentsBuilder.fromHttpUrl(frontendUrl + "/auth/callback")
            .queryParam("token", jwt)
            .queryParam("provider", "email")
            .build().toUriString();
        
        response.sendRedirect(redirectUrl);
    }

    /**
     * Logout endpoint
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(
            @AuthenticationPrincipal OAuth2User principal,
            HttpServletRequest request,
            HttpServletResponse response) {
        
        String sessionId = request.getHeader("X-Session-ID");
        if (sessionId != null) {
            sessionService.deleteSession(sessionId);
        }

        // Clear cookies
        clearAuthCookies(response);

        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    /**
     * Refresh JWT token
     */
    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refreshToken(
            @RequestHeader("Authorization") String authHeader) {
        
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(401).body(Map.of("error", "Missing token"));
        }

        String token = authHeader.substring(7);
        try {
            var claims = jwtService.validateToken(token);
            String userId = claims.getSubject();
            String sessionId = claims.get("sessionId", String.class);
            
            // Generate new token with extended expiry
            String newToken = jwtService.generateToken(
                userRepository.getReferenceById(UUID.fromString(userId)), 
                sessionId
            );
            
            return ResponseEntity.ok(Map.of("token", newToken));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
        }
    }

    // Helper methods

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

    private User createUser(String email, String provider, String providerId, String accessToken) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("email is required");
        }
        User user = new User();
        user.setEmail(email.toLowerCase());
        user.setName(email.split("@")[0]);
        user.setProvider(provider);
        user.setProviderId(providerId);
        user.setAccessToken(accessToken);
        user.setRole("member");
        // createdAt is set by @PrePersist
        return userRepository.save(user);
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

    private void clearAuthCookies(HttpServletResponse response) {
        var cookie = new jakarta.servlet.http.Cookie("SESSION", "");
        cookie.setMaxAge(0);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        response.addCookie(cookie);
    }
}