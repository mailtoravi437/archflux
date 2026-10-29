package com.archflux.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    // Same allow-list as CORS/Origin check: no wildcard with cookie auth (SERVICES_SPEC §4.2).
    private final String[] allowedOrigins;

    public WebSocketConfig(
            @Value("${app.cors.allowed-origins:}") String configuredOrigins,
            @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl) {
        this.allowedOrigins = AllowedOrigins.from(configuredOrigins, frontendUrl)
            .asList().toArray(String[]::new);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Enable a simple message broker for in-memory messaging
        config.enableSimpleBroker("/topic", "/queue");
        
        // Application destination prefixes
        config.setApplicationDestinationPrefixes("/app");
        
        // User destination prefix for private messages
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Register STOMP endpoint with SockJS fallback
        registry.addEndpoint("/ws")
            .setAllowedOrigins(allowedOrigins)
            .withSockJS();
        
        // Also register without SockJS for native WebSocket clients
        registry.addEndpoint("/ws")
            .setAllowedOrigins(allowedOrigins);
    }
}