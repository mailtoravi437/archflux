package com.archflux.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name = "app.email.provider", havingValue = "mock", matchIfMissing = true)
public class MockEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(MockEmailService.class);

    @Override
    public void sendHtml(String to, String subject, String htmlBody) {
        log.info("MOCK EMAIL sent to {}: {}", to, subject);
        log.debug("Email body:\n{}", htmlBody);
    }
}