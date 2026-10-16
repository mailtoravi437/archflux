package com.archflux.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import com.archflux.domain.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

@Service
public class UserSessionService {

    private static final Logger log = LoggerFactory.getLogger(UserSessionService.class);

    // String/string on purpose: Boot provides StringRedisTemplate out of the
    // box, values are explicit JSON via Boot's ObjectMapper (JavaTimeModule +
    // ISO-8601), and untyped object deserialization can never silently turn a
    // SessionData into a LinkedHashMap again (live magic-link 500, Phase 1).
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${spring.session.redis.namespace:archflux:sessions:}")
    private String namespace;

    @Value("${spring.session.timeout:30d}")
    private Duration sessionTimeout;

    public UserSessionService(RedisTemplate<String, String> redisTemplate,
        ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public String createSession(User user, String clientInfo) {
        String sessionId = UUID.randomUUID().toString();
        String key = namespace + sessionId;

        var sessionData = new SessionData(
            user.getId().toString(),
            user.getEmail(),
            user.getName(),
            user.getRole(),
            user.getProvider(),
            clientInfo,
            java.time.Instant.now()
        );

        redisTemplate.opsForValue().set(key, writeJson(sessionData), Duration.ofDays(30));
        log.info("Created session {} for user {}", sessionId, user.getEmail());
        return sessionId;
    }

    public Optional<SessionData> getSession(String sessionId) {
        String key = namespace + sessionId;
        String json = redisTemplate.opsForValue().get(key);
        if (json == null || json.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(json, SessionData.class));
        } catch (Exception e) {
            log.info("Unreadable session payload for {}: {}", sessionId, e.getMessage());
            return Optional.empty();
        }
    }

    public void deleteSession(String sessionId) {
        String key = namespace + sessionId;
        redisTemplate.delete(key);
        log.info("Deleted session {}", sessionId);
    }

    public void refreshSession(String sessionId) {
        String key = namespace + sessionId;
        redisTemplate.expire(key, Duration.ofDays(30));
    }

    public String extractSessionId(HttpServletRequest request) {
        // Check header first
        String sessionId = request.getHeader("X-Session-ID");
        if (sessionId != null) return sessionId;

        // Check cookie
        if (request.getCookies() != null) {
            for (var cookie : request.getCookies()) {
                if ("SESSION".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }

    public record SessionData(
        String userId,
        String email,
        String name,
        String role,
        String provider,
        String clientInfo,
        java.time.Instant createdAt
    ) {}

    private String writeJson(SessionData sessionData) {
        try {
            return objectMapper.writeValueAsString(sessionData);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize session payload: " + e.getMessage(), e);
        }
    }
}