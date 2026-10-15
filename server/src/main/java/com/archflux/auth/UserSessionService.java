package com.archflux.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import com.archflux.domain.User;
import jakarta.servlet.http.HttpServletRequest;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

@Service
public class UserSessionService {

    private static final Logger log = LoggerFactory.getLogger(UserSessionService.class);

    private final RedisTemplate<String, Object> redisTemplate;

    @Value("${spring.session.redis.namespace:archflux:sessions:}")
    private String namespace;

    @Value("${spring.session.timeout:30d}")
    private Duration sessionTimeout;

    public UserSessionService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
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

        redisTemplate.opsForValue().set(key, sessionData, Duration.ofDays(30));
        log.info("Created session {} for user {}", sessionId, user.getEmail());
        return sessionId;
    }

    public Optional<SessionData> getSession(String sessionId) {
        String key = namespace + sessionId;
        Object data = redisTemplate.opsForValue().get(key);
        if (data instanceof SessionData session) {
            return Optional.of(session);
        }
        return Optional.empty();
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
}