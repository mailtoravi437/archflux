package com.archflux.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

@Service
public class MagicLinkService {

    private static final Logger log = LoggerFactory.getLogger(MagicLinkService.class);

    private final RedisTemplate<String, String> redisTemplate;
    private final EmailService emailService;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.magic-link-ttl-minutes:15}")
    private int ttlMinutes;

    @Value("${app.email.provider:mock}")
    private String emailProvider;

    public MagicLinkService(RedisTemplate<String, String> redisTemplate, EmailService emailService) {
        this.redisTemplate = redisTemplate;
        this.emailService = emailService;
    }

    public String generateMagicLink(String email) {
        String token = UUID.randomUUID().toString();
        String key = "magiclink:" + token;
        
        // Store email with TTL
        redisTemplate.opsForValue().set(key, email.toLowerCase(), Duration.ofMinutes(ttlMinutes));
        
        log.info("Generated magic link token for {}", email);
        return token;
    }

    /** Magic links per address per window (SVC-G27): blocks inbox flooding. */
    static final int MAX_SENDS_PER_ADDRESS = 5;
    static final Duration SEND_WINDOW = Duration.ofMinutes(15);

    /**
     * Counts a send for this address; false once the window's cap is reached.
     * Fails open on a Redis error (the per-IP limiter still applies).
     */
    public boolean allowSend(String email) {
        String key = "magiclink:sends:" + email.trim().toLowerCase();
        try {
            Long sends = redisTemplate.opsForValue().increment(key);
            if (sends != null && sends == 1L) {
                redisTemplate.expire(key, SEND_WINDOW);
            }
            return sends == null || sends <= MAX_SENDS_PER_ADDRESS;
        } catch (Exception e) {
            log.warn("Magic-link send counter unavailable; allowing: {}", e.getMessage());
            return true;
        }
    }

    public Optional<String> verifyToken(String token) {
        String key = "magiclink:" + token;
        String email = redisTemplate.opsForValue().getAndDelete(key);
        
        if (email != null) {
            log.info("Magic link verified for {}", email);
            return Optional.of(email);
        }
        
        // Never log the token itself (SVC-G28).
        log.warn("Invalid or expired magic link token");
        return Optional.empty();
    }

    public void sendMagicLinkEmail(String email, String link) {
        if ("mock".equals(emailProvider)) {
            log.info("MOCK EMAIL to {}: {}", email, link);
            return;
        }

        try {
            String subject = "Sign in to ArchFlux";
            String htmlBody = buildEmailHtml(link);
            emailService.sendHtml(email, subject, htmlBody);
            log.info("Magic link email sent to {}", email);
        } catch (Exception e) {
            log.error("Failed to send magic link email to {}", email, e);
            throw new RuntimeException("Failed to send magic link email", e);
        }
    }

    private String buildEmailHtml(String link) {
        return """
            <!DOCTYPE html>
            <html>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #1E1B4B 0%, #4C1D95 100%); padding: 30px; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">ArchFlux</h1>
                        <p style="color: #c7d2fe; margin: 8px 0 0;">Living System Canvas</p>
                    </div>
                    <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                        <h2 style="color: #1f2937; margin-top: 0;">Sign in to ArchFlux</h2>
                        <p style="color: #4b5563;">Click the button below to sign in to your ArchFlux workspace. This link expires in 15 minutes.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="%s" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                                Sign in to ArchFlux
                            </a>
                        </div>
                        <p style="color: #9ca3af; font-size: 14px;">If the button doesn't work, copy this link:<br><a href="%s" style="color: #2563eb; word-break: break-all;">%s</a></p>
                        <hr style="border-color: #e5e7eb; margin: 24px 0;">
                        <p style="color: #9ca3af; font-size: 12px;">If you didn't request this sign-in link, you can safely ignore this email.</p>
                    </div>
                </div>
            </body>
            </html>
            """.formatted(link, link, link);
    }
}