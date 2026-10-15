package com.archflux;

import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.RedisTemplate;

/**
 * Shared test infrastructure mocks. Redis is excluded from test
 * auto-configuration (see src/test/resources/application.yml), so services
 * that depend on RedisTemplate would fail context startup. Mockito mocks
 * satisfy the dependencies; tests that touch Redis-dependent behavior mock
 * the owning service instead.
 */
@TestConfiguration
public class TestInfraMocks {

  @Bean
  @Primary
  public RedisTemplate<String, String> stringRedisTemplate() {
    return Mockito.mock(RedisTemplate.class);
  }

  @Bean
  @Primary
  public RedisTemplate<String, Object> objectRedisTemplate() {
    return Mockito.mock(RedisTemplate.class);
  }

  @Bean
  @Primary
  public org.springframework.security.oauth2.jwt.JwtDecoder jwtDecoder() {
    return Mockito.mock(org.springframework.security.oauth2.jwt.JwtDecoder.class);
  }

  @Bean
  @Primary
  public org.springframework.security.oauth2.client.registration.ClientRegistrationRepository clientRegistrationRepository() {
    return Mockito.mock(org.springframework.security.oauth2.client.registration.ClientRegistrationRepository.class);
  }

  @Bean
  @Primary
  public org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository relyingPartyRegistrationRepository() {
    return Mockito.mock(org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository.class);
  }

  @Bean
  @Primary
  public org.springframework.security.oauth2.client.OAuth2AuthorizedClientService authorizedClientService() {
    return Mockito.mock(org.springframework.security.oauth2.client.OAuth2AuthorizedClientService.class);
  }
}
