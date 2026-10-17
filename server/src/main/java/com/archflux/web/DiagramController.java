package com.archflux.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.CheckpointService;
import com.archflux.service.DiagramService;
import com.archflux.service.RevisionService;
import com.archflux.service.ThreadService;
import com.archflux.web.dto.BranchCreateRequest;
import com.archflux.web.dto.CheckpointCreateRequest;
import com.archflux.web.dto.DiagramCreateRequest;
import com.archflux.web.dto.DiagramUpdateRequest;
import com.archflux.web.dto.ReplyCreateRequest;
import com.archflux.web.dto.ThreadCreateRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/diagrams")
@Tag(name = "Diagrams", description = "Architecture diagram management - CRUD, checkpoints, threads, and replies")
public class DiagramController {

  private final DiagramService diagrams;
  private final CheckpointService checkpoints;
  private final ThreadService threads;
  private final RevisionService revisions;

  public DiagramController(DiagramService diagrams, CheckpointService checkpoints,
      ThreadService threads, RevisionService revisions) {
    this.diagrams = diagrams;
    this.checkpoints = checkpoints;
    this.threads = threads;
    this.revisions = revisions;
  }

  @Operation(summary = "List diagrams", description = "Paginated list of diagrams owned by the current user")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Successful response"),
    @ApiResponse(responseCode = "401", description = "Unauthorized"),
    @ApiResponse(responseCode = "403", description = "Forbidden")
  })
  @GetMapping
  public Map<String, Object> list(
      @Parameter(description = "Page number (1-based)") @RequestParam(defaultValue = "1") int page,
      @Parameter(description = "Items per page (max 100)") @RequestParam(defaultValue = "20") int limit,
      @Parameter(description = "Search query") @RequestParam(required = false) String q,
      HttpServletRequest request) {
    int safeLimit = limit <= 0 ? DiagramService.DEFAULT_LIMIT : Math.min(limit, DiagramService.MAX_LIMIT);
    int safePage = Math.max(page, 1);
    DiagramService.PageResult<Map<String, Object>> result =
        diagrams.list(RequestUser.get(request), safePage, safeLimit, q);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("data", result.items());
    out.put("page", safePage);
    out.put("limit", safeLimit);
    out.put("total", result.total());
    return out;
  }

  @Operation(summary = "Create diagram", description = "Create a new architecture diagram")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "Diagram created"),
    @ApiResponse(responseCode = "400", description = "Invalid request"),
    @ApiResponse(responseCode = "401", description = "Unauthorized")
  })
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request,
      @Valid @RequestBody DiagramCreateRequest body) {
    Map<String, Object> created = diagrams.create(RequestUser.get(request), body.getTitle(),
        body.getTags(), body.getGraph(), body.getNodes(), body.getEdges(),
        body.getStrokes(), body.getTexts());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @Operation(summary = "Get diagram", description = "Get a single diagram by ID")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Diagram found"),
    @ApiResponse(responseCode = "404", description = "Diagram not found"),
    @ApiResponse(responseCode = "403", description = "Forbidden - diagram belongs to another user")
  })
  @GetMapping("/{id}")
  public Map<String, Object> get(
      @Parameter(description = "Diagram ID") @PathVariable UUID id,
      HttpServletRequest request) {
    return Map.of("data", diagrams.get(RequestUser.get(request), id));
  }

  @PutMapping("/{id}")
  public Map<String, Object> update(HttpServletRequest request, @PathVariable UUID id,
      @RequestBody DiagramUpdateRequest body,
      @RequestParam(required = false) Long version) {
    Long expected = body.getVersion() != null ? body.getVersion() : version;
    Map<String, Object> updated = diagrams.update(RequestUser.get(request), id,
        body.getTitle(), body.getTags(), body.getGraph(), body.getNodes(),
        body.getEdges(), body.getStrokes(), body.getTexts(),
        body.isGraphProvided(), body.isTagsPresent(), expected, body.isForce(), "manual");
    return Map.of("data", updated);
  }

  @GetMapping("/{id}/revisions")
  public Map<String, Object> listRevisions(HttpServletRequest request, @PathVariable UUID id) {
    UUID ownerId = RequestUser.get(request);
    com.archflux.domain.Diagram diagram = diagrams.requireOwnedForRead(ownerId, id);
    List<Map<String, Object>> items = revisions.list(diagram.getId()).stream()
        .map(rev -> revisions.toJson(rev, false)).toList();
    return Map.of("data", items);
  }

  @GetMapping("/{id}/revisions/{revId}")
  public Map<String, Object> getRevision(HttpServletRequest request,
      @PathVariable UUID id, @PathVariable UUID revId) {
    UUID ownerId = RequestUser.get(request);
    com.archflux.domain.Diagram diagram = diagrams.requireOwnedForRead(ownerId, id);
    return Map.of("data", revisions.toJson(revisions.get(diagram.getId(), revId), true));
  }

  @GetMapping("/{id}/diff")
  public Map<String, Object> diff(HttpServletRequest request,
      @PathVariable UUID id,
      @RequestParam UUID from, @RequestParam UUID to) {
    UUID ownerId = RequestUser.get(request);
    com.archflux.domain.Diagram diagram = diagrams.requireOwnedForRead(ownerId, id);
    return revisions.diff(diagram.getId(), from, to);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(HttpServletRequest request, @PathVariable UUID id) {
    diagrams.delete(RequestUser.get(request), id);
    return ResponseEntity.noContent().build();
  }

  @Operation(summary = "List checkpoints", description = "Newest-first snapshots, optionally filtered by branch")
  @GetMapping("/{id}/checkpoints")
  public Map<String, Object> listCheckpoints(
      HttpServletRequest request,
      @PathVariable UUID id,
      @Parameter(description = "Only checkpoints on this branch") @RequestParam(required = false) String branch) {
    return Map.of("data", checkpoints.list(RequestUser.get(request), id, branch));
  }

  @PostMapping("/{id}/checkpoints")
  public ResponseEntity<Map<String, Object>> createCheckpoint(HttpServletRequest request,
      @PathVariable UUID id, @Valid @RequestBody CheckpointCreateRequest body) {
    Map<String, Object> created =
        checkpoints.create(RequestUser.get(request), id, body.getTitle(), body.getMeta(), body.getBranch());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @Operation(summary = "Delete checkpoint", description = "Delete a checkpoint owned via the diagram")
  @DeleteMapping("/{id}/checkpoints/{cid}")
  public ResponseEntity<Void> deleteCheckpoint(HttpServletRequest request,
      @PathVariable UUID id, @PathVariable("cid") UUID checkpointId) {
    checkpoints.delete(RequestUser.get(request), id, checkpointId);
    return ResponseEntity.noContent().build();
  }

  @Operation(summary = "Restore checkpoint", description = "Restore a diagram's graph from a checkpoint snapshot (versioning)")
  @PostMapping("/{id}/checkpoints/{cid}/restore")
  public Map<String, Object> restoreCheckpoint(HttpServletRequest request,
      @PathVariable UUID id, @PathVariable("cid") UUID checkpointId) {
    Map<String, Object> restored = checkpoints.restore(RequestUser.get(request), id, checkpointId);
    return Map.of("data", restored);
  }

  @Operation(summary = "Create branch", description = "Duplicate a diagram as a new branch with parent link")
  @PostMapping("/{id}/branches")
  public ResponseEntity<Map<String, Object>> createBranch(HttpServletRequest request,
      @PathVariable UUID id, @Valid @RequestBody BranchCreateRequest body) {
    Map<String, Object> created =
        diagrams.createBranch(RequestUser.get(request), id, body.getTitle(), body.getBranchName());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @GetMapping("/{id}/threads")
  public Map<String, Object> listThreads(HttpServletRequest request, @PathVariable UUID id) {
    List<Map<String, Object>> items = threads.listThreads(RequestUser.get(request), id);
    return Map.of("data", items);
  }

  @PostMapping("/{id}/threads")
  public ResponseEntity<Map<String, Object>> createThread(HttpServletRequest request,
      @PathVariable UUID id, @Valid @RequestBody ThreadCreateRequest body) {
    Map<String, Object> created = threads.createThread(RequestUser.get(request), id,
        body.getAuthor(), body.getPinnedTo(), body.getText(), body.getResolved());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @GetMapping("/{id}/threads/{tid}/replies")
  public Map<String, Object> listReplies(HttpServletRequest request,
      @PathVariable UUID id, @PathVariable UUID tid) {
    return Map.of("data", threads.listReplies(RequestUser.get(request), id, tid));
  }

  @PostMapping("/{id}/threads/{tid}/replies")
  public ResponseEntity<Map<String, Object>> createReply(HttpServletRequest request,
      @PathVariable UUID id, @PathVariable UUID tid,
      @Valid @RequestBody ReplyCreateRequest body) {
    Map<String, Object> created = threads.createReply(RequestUser.get(request), id, tid,
        body.getAuthor(), body.getText());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }
}
