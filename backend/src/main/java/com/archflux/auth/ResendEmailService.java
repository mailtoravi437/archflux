package com.archflux.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Service
@ConditionalOnProperty(name = "app.email.provider", havingValue = "resend")
public class ResendEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailService.class);

    private final WebClient webClient;

    @Value("${app.resend-api-key:}")
    private String apiKey;

    @Value("${app.email.from:noreply@archflux.io}")
    private String fromEmail;

    public ResendEmailService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
            .baseUrl("https://api.resend.com")
            .defaultHeader("Authorization", "Bearer " + apiKey)
            .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    @Override
    public void sendHtml(String to, String subject, String htmlBody) {
        var requestBody = new ResendRequest(fromEmail, to, subject, htmlBody);
        
        webClient.post()
            .uri("/emails")
            .body(Mono.just(requestBody), ResendRequest.class)
            .retrieve()
            .bodyToMono(ResendResponse.class)
            .doOnSuccess(response -> log.info("Email sent via Resend to {} (id: {})", to, response.id()))
            .doOnError(error -> log.error("Failed to send email to {}", to, error))
            .block();
    }

    record ResendRequest(String from, String to, String subject, String html) {}
    record ResendResponse(String id) {}
}