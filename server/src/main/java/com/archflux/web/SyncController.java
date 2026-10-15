package com.archflux.web;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import com.archflux.security.RequestUser;
import com.archflux.service.CheckpointService;
import com.archflux.service.SyncService;
import com.archflux.service.DiagramService;
import com.archflux.web.dto.SyncRequest;
import jakarta.servlet.http.HttpServletRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/sync")
@Tag(name = "Sync", description = "Idempotent synchronization with upstream infrastructure")
public class SyncController {

  private final SyncService syncService;
  private final DiagramService diagramService;
  private final CheckpointService checkpointService;
  private final WebClient.Builder webClientBuilder;

  @Value("${github.api-token:}")
  private String githubToken;

  @Value("${github.api-url:https://api.github.com}")
  private String githubApiUrl;

  @Value("${GITHUB_WEBHOOK_SECRET:}")
  private String webhookSecretProp;

  public SyncController(SyncService syncService, DiagramService diagramService,
      CheckpointService checkpointService, WebClient.Builder webClientBuilder) {
    this.syncService = syncService;
    this.diagramService = diagramService;
    this.checkpointService = checkpointService;
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

  @Operation(summary = "Sync diagram with upstream", description = "Idempotent sync - computes canonical SHA from diagram+upstream, returns noop if already processed")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Sync completed or noop"),
    @ApiResponse(responseCode = "401", description = "Unauthorized"),
    @ApiResponse(responseCode = "503", description = "Schema not ready")
  })
  @PostMapping
  public Map<String, Object> sync(HttpServletRequest request,
      @Parameter(description = "Sync request with diagram and upstream data", required = false) 
      @RequestBody(required = false) SyncRequest body) {
    UUID userId = RequestUser.get(request);
    SyncService.SyncOutcome outcome = syncService.sync(userId, RequestUser.ACTOR,
        body == null ? null : body.getDiagram(), body == null ? null : body.getUpstream());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("status", outcome.status());
    out.put("driftEvaluated", outcome.driftEvaluated());
    out.put("nodesSynced", outcome.nodesSynced());
    out.put("edgesSynced", outcome.edgesSynced());
    out.put("commitSha", outcome.commitSha());
    out.put("timestamp", outcome.timestamp() == null ? null : outcome.timestamp().toString());
    return out;
  }

  /**
   * Git webhook handler - receives push events from GitHub/GitLab and triggers diagram sync
   */
  @Operation(summary = "Git webhook handler", description = "Receives push webhooks from GitHub/GitLab and syncs changed .arch files")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Webhook processed"),
    @ApiResponse(responseCode = "401", description = "Invalid signature"),
    @ApiResponse(responseCode = "400", description = "Invalid payload")
  })
  @PostMapping("/webhook/git")
  public ResponseEntity<Map<String, Object>> gitWebhook(
      HttpServletRequest request,
      @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature,
      @RequestHeader(value = "X-GitHub-Event", required = false) String event,
      @RequestBody(required = false) String payload) {
    if (signature == null || signature.isBlank()) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", "Missing signature"));
    }
    String secret = webhookSecretProp != null && !webhookSecretProp.isBlank()
        ? webhookSecretProp : System.getenv("GITHUB_WEBHOOK_SECRET");
    if (secret == null || secret.isBlank()) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("error", "Webhook secret not configured"));
    }
    // Verify GitHub signature (constant-time compare)
    String expectedSignature = "sha256=" + hmacSha256(payload == null ? "" : payload, secret);
    if (!MessageDigest.isEqual(expectedSignature.getBytes(StandardCharsets.UTF_8),
        signature.getBytes(StandardCharsets.UTF_8))) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", "Invalid signature"));
    }

    // Only process push events
    if (!"push".equals(event)) {
      return ResponseEntity.ok(Map.of("message", "Event ignored: " + event));
    }

    // Parse payload
    com.fasterxml.jackson.databind.JsonNode json;
    try {
      json = diagramService.getMapper().readTree(payload);
    } catch (Exception e) {
      return ResponseEntity.badRequest().body(Map.of("error", "Invalid JSON payload"));
    }

    // Extract repository info and changed files
    String repoFullName = json.path("repository").path("full_name").asText();
    String ref = json.path("ref").asText(); // e.g., "refs/heads/main"
    String branch = ref.startsWith("refs/heads/") ? ref.substring(11) : ref;
    
    com.fasterxml.jackson.databind.JsonNode commits = json.path("commits");
    if (commits == null || !commits.isArray()) {
      return ResponseEntity.ok(Map.of("message", "No commits in payload"));
    }

    // Check for .arch file changes (added + modified + removed + head_commit)
    boolean archFileChanged = false;
    String archFilePath = null;
    List<String> changeFields = List.of("added", "modified", "removed");
    for (var commit : commits) {
        for (String field : changeFields) {
            var files = commit.path(field);
            if (files != null && files.isArray()) {
                for (var file : files) {
                    String path = file.asText();
                    if (path != null && path.endsWith(".arch")) {
                        archFileChanged = true;
                        archFilePath = path;
                        break;
                    }
                }
            }
            if (archFileChanged) break;
        }
        if (archFileChanged) break;
    }
    if (!archFileChanged) {
        var head = json.path("head_commit");
        for (String field : changeFields) {
            var files = head.path(field);
            if (files != null && files.isArray()) {
                for (var file : files) {
                    String path = file.asText();
                    if (path != null && path.endsWith(".arch")) {
                        archFileChanged = true;
                        archFilePath = path;
                        break;
                    }
                }
            }
            if (archFileChanged) break;
        }
    }

    if (!archFileChanged) {
      return ResponseEntity.ok(Map.of("message", "No .arch files changed"));
    }

    // Fetch the .arch file content from GitHub API
    String archContent = fetchArchFileFromGitHub(repoFullName, branch, archFilePath);
    if (archContent == null) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND)
          .body(Map.of("error", "Could not fetch .arch file"));
    }

    // Parse the .arch file and create/update diagram.
    // GitHub cannot send our dev-token Bearer, so allow a webhook-mapped user:
    // prefer the authenticated request user, else GITHUB_WEBHOOK_USER_ID env.
    UUID userId = RequestUser.get(request);
    if (userId == null) {
      String mapped = System.getenv("GITHUB_WEBHOOK_USER_ID");
      if (mapped != null && !mapped.isBlank()) {
        try {
          userId = UUID.fromString(mapped.trim());
        } catch (Exception ignored) {
          userId = null;
        }
      }
    }
    if (userId == null) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", "Webhook has no mapped user: send dev-token Bearer or set GITHUB_WEBHOOK_USER_ID"));
    }
    createOrUpdateDiagramFromArch(repoFullName, branch, archFilePath, archContent, userId);
    
    return ResponseEntity.ok(Map.of(
        "message", "Diagram synced",
        "repository", repoFullName,
        "branch", branch,
        "file", archFilePath
    ));
  }

  static String hmacSha256(String data, String secret) {
    try {
      javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
      mac.init(new javax.crypto.spec.SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(hash.length * 2);
      for (byte b : hash) {
        hex.append(String.format("%02x", b));
      }
      return hex.toString();
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private String fetchArchFileFromGitHub(String repo, String branch, String path) {
    try {
      JsonNode envelope = githubClient().get()
          .uri(uriBuilder -> uriBuilder.path("/repos/{repo}/contents/{path}")
              .queryParam("ref", branch).build(repo, path))
          .retrieve()
          .bodyToMono(JsonNode.class)
          .blockOptional()
          .orElse(null);
      if (envelope == null) return null;
      if (envelope.isTextual()) return envelope.asText();
      String encoding = envelope.path("encoding").asText("");
      String content = envelope.path("content").asText(null);
      if (content != null && encoding.equalsIgnoreCase("base64")) {
        String cleaned = content.replaceAll("\\s", "");
        return new String(Base64.getMimeDecoder().decode(cleaned), StandardCharsets.UTF_8);
      }
      if (envelope.has("content")) return envelope.path("content").asText();
      return envelope.toString();
    } catch (Exception e) {
      // Log error but don't fail the webhook
      return null;
    }
  }

  void createOrUpdateDiagramFromArch(String repoFullName, String branch, String archFilePath, String archContent, UUID userId) {
    org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SyncController.class);
    try {
      // Parse the .arch content (supports {nodes,edges,strokes,texts} or {graph:{...}})
      JsonNode archJson = diagramService.getMapper().readTree(archContent);
      JsonNode graphNode = archJson.has("graph") ? archJson.path("graph") : archJson;
      JsonNode nodes = graphNode.path("nodes");
      JsonNode edges = graphNode.path("edges");
      JsonNode strokes = graphNode.path("strokes");
      JsonNode texts = graphNode.path("texts");

      // Generate diagram title from repo and file
      String diagramTitle = repoFullName + " - " + archFilePath;
      List<String> tags = Arrays.asList("github", repoFullName, archFilePath, "branch:" + branch);

      // Search for existing diagram with this repo tag
      String repoTag = "github:" + repoFullName + ":" + archFilePath;
      var existingResult = diagramService.list(userId, 1, 10, repoTag);
      UUID diagramId;

      if (!existingResult.items().isEmpty()) {
        // Update existing diagram — pass through parsed nodes/edges/strokes/texts
        String existingIdStr = String.valueOf(existingResult.items().get(0).get("id"));
        diagramId = UUID.fromString(existingIdStr);

        diagramService.update(
            userId, diagramId,
            diagramTitle,
            tags,
            graphNode.isMissingNode() ? null : graphNode,
            nodes.isMissingNode() ? null : nodes,
            edges.isMissingNode() ? null : edges,
            strokes.isMissingNode() ? null : strokes,
            texts.isMissingNode() ? null : texts,
            true, true
        );
      } else {
        // Create new diagram (preserve strokes/texts)
        com.fasterxml.jackson.databind.node.ObjectNode fullGraph = diagramService.getMapper().createObjectNode();
        fullGraph.set("nodes", nodes.isMissingNode() ? diagramService.getMapper().createArrayNode() : nodes);
        fullGraph.set("edges", edges.isMissingNode() ? diagramService.getMapper().createArrayNode() : edges);
        fullGraph.set("strokes", strokes.isMissingNode() ? diagramService.getMapper().createArrayNode() : strokes);
        fullGraph.set("texts", texts.isMissingNode() ? diagramService.getMapper().createArrayNode() : texts);

        var created = diagramService.create(
            userId,
            diagramTitle,
            tags,
            fullGraph, fullGraph.path("nodes"), fullGraph.path("edges"),
            fullGraph.path("strokes"), fullGraph.path("texts")
        );
        diagramId = UUID.fromString(String.valueOf(created.get("id")));
      }

      try {
        checkpointService.create(userId, diagramId, "webhook:" + branch + ":" + archFilePath,
            "repo=" + repoFullName, branch);
      } catch (Exception e) {
        log.warn("Webhook checkpoint failed for diagram {}: {}", diagramId, e.getMessage());
      }
    } catch (Exception e) {
      org.slf4j.LoggerFactory.getLogger(SyncController.class)
          .warn("Failed to create/update diagram from .arch: {}", e.getMessage());
    }
  }

  /**
   * Health check for GitHub API connectivity
   */
  @GetMapping("/webhook/git/health")
  public ResponseEntity<Map<String, Object>> gitWebhookHealth() {
    try {
      // Test GitHub API connectivity
      JsonNode result = githubClient().get()
          .uri(uriBuilder -> uriBuilder.path("/repos/{repo}/contents/{path}")
              .queryParam("ref", "main").build("github", "docs/README.md"))
          .retrieve()
          .bodyToMono(JsonNode.class)
          .blockOptional()
          .orElse(null);
      
      boolean healthy = result != null && !result.isEmpty();
      return ResponseEntity.ok(Map.of(
          "healthy", healthy,
          "githubApiUrl", githubApiUrl,
          "hasToken", githubToken != null && !githubToken.isEmpty()
      ));
    } catch (Exception e) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("healthy", false, "error", e.getMessage()));
    }
  }
}
