package com.archflux.service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Fetches {@code .arch} file contents via the GitHub Contents API (Base64
 * decode). Extracted as a component so webhook processing stays unit-testable
 * without network access.
 */
@Component
public class GitHubArchFetcher {

  private final WebClient.Builder webClientBuilder;

  @Value("${github.api-token:}")
  private String githubToken;

  @Value("${github.api-url:https://api.github.com}")
  private String githubApiUrl;

  public GitHubArchFetcher(WebClient.Builder webClientBuilder) {
    this.webClientBuilder = webClientBuilder;
  }

  private WebClient githubClient() {
    WebClient.Builder builder = webClientBuilder.baseUrl(
        githubApiUrl != null && !githubApiUrl.isBlank() ? githubApiUrl : "https://api.github.com");
    if (githubToken != null && !githubToken.isBlank()) {
      builder = builder.defaultHeader("Authorization", "Bearer " + githubToken);
    }
    return builder.defaultHeader("Accept", "application/vnd.github+json").build();
  }

  /** Returns the decoded file content, or null when unreachable. */
  public String fetch(String repo, String branch, String path) {
    try {
      JsonNode envelope = githubClient().get()
          .uri(uriBuilder -> uriBuilder.path("/repos/{repo}/contents/{path}")
              .queryParam("ref", branch).build(repo, path))
          .retrieve()
          .bodyToMono(JsonNode.class)
          .blockOptional()
          .orElse(null);
      if (envelope == null) {
        return null;
      }
      if (envelope.isTextual()) {
        return envelope.asText();
      }
      String encoding = envelope.path("encoding").asText("");
      String content = envelope.path("content").asText(null);
      if (content != null && encoding.equalsIgnoreCase("base64")) {
        String cleaned = content.replaceAll("\\s", "");
        return new String(Base64.getMimeDecoder().decode(cleaned), StandardCharsets.UTF_8);
      }
      if (envelope.has("content")) {
        return envelope.path("content").asText();
      }
      return envelope.toString();
    } catch (Exception e) {
      return null;
    }
  }
}
