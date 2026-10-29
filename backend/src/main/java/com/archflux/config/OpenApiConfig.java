package com.archflux.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

  @Value("${server.port:3001}")
  private int serverPort;

  @Value("${spring.profiles.active:default}")
  private String activeProfile;

  @Bean
  public OpenAPI archfluxOpenAPI() {
    String baseUrl = activeProfile.equals("prod") 
      ? "https://api.archflux.internal" 
      : "http://localhost:" + serverPort;
    
    return new OpenAPI()
      .info(new Info()
        .title("ArchFlux API")
        .version("1.0.0")
        .description("""
            ArchFlux Living System Canvas API
            
            Deterministic architecture diagram management with:
            - Multi-document workspace with version control
            - Real-time sync with infrastructure (K8s, OpenAPI, Terraform)
            - Architecture linting (orphans, dangling wires, ambiguous edges)
            - Visual diffing between checkpoints
            - Threaded review comments bound to nodes
            - Git-integrated .arch file management
            
            All endpoints require authentication via Bearer token (APP_API_TOKEN).
            """)
        .license(new License()
          .name("Proprietary")
          .url("https://archflux.io/license"))
      )
      .servers(List.of(
        new Server().url(baseUrl).description(activeProfile.equals("prod") ? "Production" : "Development")
      ));
  }
}