package com.archflux.auth;

import com.archflux.domain.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
public class JwtService {

    private final SecretKey secretKey;
    private final SecretKey prevSecretKey;
    private final String issuer;
    private final String audience;
    private final long accessTokenExpiryMinutes;
    private final long refreshTokenExpiryDays;

    public JwtService(
            @Value("${app.jwt-secret:dev-secret-change-in-production}") String secret,
            @Value("${app.jwt-prev-secret:}") String prevSecret,
            @Value("${app.jwt-issuer:archflux}") String issuer,
            @Value("${app.jwt-audience:archflux-api}") String audience,
            @Value("${app.jwt-access-token-minutes:60}") long accessTokenExpiryMinutes,
            @Value("${app.jwt-refresh-token-days:30}") long refreshTokenExpiryDays) {
        this.secretKey = hmacKey(secret, "app.jwt-secret (JWT_SECRET)");
        this.prevSecretKey = (prevSecret != null && !prevSecret.isBlank())
            ? hmacKey(prevSecret, "app.jwt-prev-secret (JWT_PREV_SECRET)")
            : null;
        this.issuer = issuer;
        this.audience = audience;
        this.accessTokenExpiryMinutes = accessTokenExpiryMinutes;
        this.refreshTokenExpiryDays = refreshTokenExpiryDays;
    }

    /**
     * Fail fast with an actionable message instead of JJWT's WeakKeyException:
     * HMAC-SHA needs >= 256-bit keys (RFC 7518 §3.2). This is what stops a
     * deployment with a missing/placeholder JWT_SECRET from serving traffic.
     */
    private static SecretKey hmacKey(String secret, String property) {
        byte[] bytes = secret == null ? new byte[0] : secret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("FATAL: " + property
                + " must be at least 256 bits (32+ characters) — set JWT_SECRET to a strong random value. Refusing to start.");
        }
        return Keys.hmacShaKeyFor(bytes);
    }

    public String generateToken(User user, String sessionId) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(user.getId().toString())
            .issuer(issuer)
            .audience().add(audience).and()
            .claim("email", user.getEmail())
            .claim("name", user.getName())
            .claim("role", user.getRole())
            .claim("provider", user.getProvider())
            .claim("sessionId", sessionId)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(accessTokenExpiryMinutes, ChronoUnit.MINUTES)))
            .signWith(secretKey)
            .compact();
    }

    public String generateRefreshToken(UUID userId, String sessionId) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .issuer(issuer)
            .audience().add(audience).and()
            .claim("type", "refresh")
            .claim("sessionId", sessionId)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(refreshTokenExpiryDays, ChronoUnit.DAYS)))
            .signWith(secretKey)
            .compact();
    }

    /**
     * Validates signature, issuer, audience, and expiry (jjwt enforces
     * exp/nbf automatically). Falls back to the previous rotation secret
     * when {@code app.jwt-prev-secret} is configured, so tokens minted
     * before a rotation still validate during the overlap window.
     */
    public Claims validateToken(String token) {
        JwtException lastFailure = null;
        for (SecretKey key : verificationKeys()) {
            try {
                return Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(issuer)
                    .requireAudience(audience)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            } catch (JwtException e) {
                lastFailure = e;
            }
        }
        throw lastFailure != null ? lastFailure
            : new io.jsonwebtoken.security.SignatureException("No verification key configured");
    }

    public boolean isTokenValid(String token) {
        try {
            validateToken(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public UUID getUserIdFromToken(String token) {
        return getUserId(token);
    }

    public UUID getUserId(String token) {
        Claims claims = validateToken(token);
        return UUID.fromString(claims.getSubject());
    }

    public String getRole(String token) {
        Claims claims = validateToken(token);
        return claims.get("role", String.class);
    }

    public String getSessionIdFromToken(String token) {
        Claims claims = validateToken(token);
        return claims.get("sessionId", String.class);
    }

    /** Access-token TTL in seconds — used as the ARCHFLUX_TOKEN cookie Max-Age. */
    public long getAccessTokenTtlSeconds() {
        return accessTokenExpiryMinutes * 60L;
    }

    private List<SecretKey> verificationKeys() {
        List<SecretKey> keys = new ArrayList<>(2);
        keys.add(secretKey);
        if (prevSecretKey != null) {
            keys.add(prevSecretKey);
        }
        return keys;
    }
}
