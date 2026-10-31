package com.archflux.web;

import com.archflux.auth.AuthProviderService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** Public: which sign-in buttons the login screen may show (H4). Never exposes credentials. */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthProvidersController {

  private final AuthProviderService providers;

  public AuthProvidersController(AuthProviderService providers) {
    this.providers = providers;
  }

  @GetMapping("/providers")
  public Map<String, Object> providers() {
    List<Map<String, String>> list = providers.configured().stream()
        .map(id -> Map.of("id", id)).toList();
    return Map.of("data", Map.of("providers", list));
  }
}
