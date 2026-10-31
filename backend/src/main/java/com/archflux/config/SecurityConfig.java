package com.archflux.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.config.Customizer;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String[] PUBLIC_ENDPOINTS = {
        "/",
        "/health",
        "/ready",
        "/api/health",
        "/api/ready",
        "/login**",
        "/oauth2/**",
        "/auth/**",
        "/api/v1/auth/**",
        "/api/v1/sync/webhook/**",
        "/saml2/**",
        "/error",
        "/v3/api-docs/**",
        "/swagger-ui/**",
        "/swagger-ui.html"
    };

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
            @org.springframework.beans.factory.annotation.Value("${app.saml.enabled:true}") boolean samlEnabled)
            throws Exception {
        http
            // Bridges the JWT identity validated by the outer AuthFilter into
            // the SecurityContext (cookie-authenticated requests carry no
            // Bearer header for the resource-server filter to consume).
            .addFilterAfter(new com.archflux.security.RequestUserBridgeFilter(), org.springframework.security.web.context.SecurityContextHolderFilter.class)
            // Single CORS source: CorsConfig (AllowedOrigins, SERVICES_SPEC §4.2).
            .cors(Customizer.withDefaults())
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session
                // No concurrent-session cap: the JWT cookie is the credential. A cap expired a
                // user's older HttpSession on a parallel page load and the expired-session path
                // then cleared ARCHFLUX_TOKEN via the logout handlers (R1-BUG-14).
                .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
            )
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth2 -> oauth2
                .loginPage("/login")
                .authorizationEndpoint(endpoint ->
                    endpoint.baseUri("/oauth2/authorize"))
                .redirectionEndpoint(endpoint ->
                    endpoint.baseUri("/login/oauth2/code/*"))
                .defaultSuccessUrl("/api/v1/auth/success", true)
                // Hands off to AuthController, which redirects to the SPA path route.
                .failureUrl("/api/v1/auth/failure")
            )
            // NOTE: no oauth2ResourceServer JWT configurer — user JWTs are
            // validated by the outer AuthFilter (JJWT) and promoted into the
            // SecurityContext by RequestUserBridgeFilter. A resource-server
            // decoder would need its own bean and would double-authenticate
            // our cookie/header credentials against the wrong issuer.
            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login")
                .invalidateHttpSession(true)
                .clearAuthentication(true)
                .deleteCookies("JSESSIONID", "SESSION", "ARCHFLUX_TOKEN")
            )
            // API service: unauthenticated requests get 401 JSON, never a redirect
            // to a /login page that only exists in the SPA (SVC-G32).
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(401);
                    response.setContentType("application/json");
                    response.getWriter().write(
                        "{\"error\":{\"code\":\"UNAUTHENTICATED\",\"message\":\"Authentication required\"}}");
                })
            );

        // SAML is optional: production runs without an identity provider (app.saml.enabled=false),
        // so its registration and signing key are never needed there.
        if (samlEnabled) {
            http.saml2Login(saml2 -> saml2.loginPage("/login"));
        }
        return http.build();
    }

    @Bean
    public org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter jwtAuthenticationConverter() {
        var converter = new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            var authorities = new java.util.ArrayList<org.springframework.security.core.GrantedAuthority>();
            var realmAccess = jwt.getClaimAsMap("realm_access");
            if (realmAccess != null) {
                @SuppressWarnings("unchecked")
                var roles = (List<String>) realmAccess.get("roles");
                if (roles != null) {
                    roles.forEach(role -> authorities.add(
                        new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role)
                    ));
                }
            }
            var scope = jwt.getClaimAsString("scope");
            if (scope != null) {
                Arrays.stream(scope.split(" "))
                    .forEach(s -> authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("SCOPE_" + s)));
            }
            return authorities;
        });
        return converter;
    }

}
