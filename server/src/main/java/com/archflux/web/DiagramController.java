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
import com.archflux.service.ThreadService;
import com.archflux.web.dto.CheckpointCreateRequest;
import com.archflux.web.dto.DiagramCreateRequest;
import com.archflux.web.dto.DiagramUpdateRequest;
import com.archflux.web.dto.ReplyCreateRequest;
import com.archflux.web.dto.ThreadCreateRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/diagrams")
public class DiagramController {

  private final DiagramService diagrams;
  private final CheckpointService checkpoints;
  private final ThreadService threads;

  public DiagramController(DiagramService diagrams, CheckpointService checkpoints,
      ThreadService threads) {
    this.diagrams = diagrams;
    this.checkpoints = checkpoints;
    this.threads = threads;
  }

  @GetMapping
  public Map<String, Object> list(HttpServletRequest request,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int limit,
      @RequestParam(required = false) String q) {
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

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request,
      @Valid @RequestBody DiagramCreateRequest body) {
    Map<String, Object> created = diagrams.create(RequestUser.get(request), body.getTitle(),
        body.getTags(), body.getGraph(), body.getNodes(), body.getEdges(),
        body.getStrokes(), body.getTexts());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(HttpServletRequest request, @PathVariable UUID id) {
    return Map.of("data", diagrams.get(RequestUser.get(request), id));
  }

  @PutMapping("/{id}")
  public Map<String, Object> update(HttpServletRequest request, @PathVariable UUID id,
      @RequestBody DiagramUpdateRequest body) {
    Map<String, Object> updated = diagrams.update(RequestUser.get(request), id,
        body.getTitle(), body.getTags(), body.getGraph(), body.getNodes(),
        body.getEdges(), body.getStrokes(), body.getTexts(),
        body.isGraphProvided(), body.isTagsPresent());
    return Map.of("data", updated);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(HttpServletRequest request, @PathVariable UUID id) {
    diagrams.delete(RequestUser.get(request), id);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/{id}/checkpoints")
  public Map<String, Object> listCheckpoints(HttpServletRequest request, @PathVariable UUID id) {
    return Map.of("data", checkpoints.list(RequestUser.get(request), id));
  }

  @PostMapping("/{id}/checkpoints")
  public ResponseEntity<Map<String, Object>> createCheckpoint(HttpServletRequest request,
      @PathVariable UUID id, @Valid @RequestBody CheckpointCreateRequest body) {
    Map<String, Object> created =
        checkpoints.create(RequestUser.get(request), id, body.getTitle(), body.getMeta());
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
