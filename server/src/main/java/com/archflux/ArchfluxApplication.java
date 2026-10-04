package com.archflux;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ArchfluxApplication {

  public static void main(String[] args) {
    failFastOnMissingProdToken();
    SpringApplication.run(ArchfluxApplication.class, args);
  }

  /**
   * Prod fail-fast before the context even starts: with profile prod and no
   * token configured, refuse to boot. (Belt and braces with AppProperties.)
   */
  static void failFastOnMissingProdToken() {
    String profiles = System.getenv().getOrDefault("SPRING_PROFILES_ACTIVE", "");
    boolean prod = false;
    for (String profile : profiles.split(",")) {
      if (profile.trim().equalsIgnoreCase("prod") || profile.trim().equalsIgnoreCase("production")) {
        prod = true;
      }
    }
    if (prod) {
      String token = System.getenv().getOrDefault("APP_API_TOKEN", "");
      if (token.isBlank()) {
        token = System.getenv().getOrDefault("API_TOKEN", "");
      }
      if (token.isBlank()) {
        System.err.println("FATAL: APP_API_TOKEN (or API_TOKEN) must be set when profile 'prod' is active.");
        System.exit(1);
      }
    }
  }
}
