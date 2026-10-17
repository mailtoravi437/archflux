package com.archflux.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Diagram;
import com.archflux.domain.Reply;
import com.archflux.domain.ReviewThread;
import com.archflux.repo.ReplyRepository;
import com.archflux.repo.ThreadRepository;

/** Review threads + replies on diagrams. */
@Service
public class ThreadService {

  private final ThreadRepository threads;
  private final ReplyRepository replies;
  private final DiagramService diagrams;
  private final AuditService audit;

  public ThreadService(ThreadRepository threads, ReplyRepository replies, DiagramService diagrams,
      AuditService audit) {
    this.threads = threads;
    this.replies = replies;
    this.diagrams = diagrams;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> listThreads(UUID ownerId, UUID diagramId) {
    diagrams.requireOwnedForRead(ownerId, diagramId);
    return threads.findByDiagram_IdOrderByCreatedAtAsc(diagramId).stream().map(this::threadToJson).toList();
  }

  @Transactional
  public Map<String, Object> createThread(UUID ownerId, UUID diagramId, String author,
      String pinnedTo, String text, Boolean resolved) {
    if (author == null || author.isBlank()) {
      throw ApiException.validation("author is required");
    }
    if (text == null || text.isBlank()) {
      throw ApiException.validation("text is required");
    }
    Diagram diagram = diagrams.requireOwnedForWrite(ownerId, diagramId);
    ReviewThread thread = new ReviewThread();
    thread.setDiagram(diagram);
    thread.setAuthor(author);
    thread.setPinnedTo(pinnedTo);
    thread.setText(text);
    thread.setResolved(resolved != null && resolved);
    Map<String, Object> created = threadToJson(threads.saveAndFlush(thread));
    audit.record(ownerId, diagram.workspaceId(), "thread.create", "thread",
        String.valueOf(created.get("id")), "ok");
    return created;
  }

  @Transactional(readOnly = true)
  public List<Map<String, Object>> listReplies(UUID ownerId, UUID diagramId, UUID threadId) {
    ReviewThread thread = requireThreadInDiagram(ownerId, diagramId, threadId, false);
    return replies.findByThread_IdOrderByCreatedAtAsc(thread.getId()).stream().map(this::replyToJson).toList();
  }

  @Transactional
  public Map<String, Object> createReply(UUID ownerId, UUID diagramId, UUID threadId,
      String author, String text) {
    if (author == null || author.isBlank()) {
      throw ApiException.validation("author is required");
    }
    if (text == null || text.isBlank()) {
      throw ApiException.validation("text is required");
    }
    ReviewThread thread = requireThreadInDiagram(ownerId, diagramId, threadId, true);
    Reply reply = new Reply();
    reply.setThread(thread);
    reply.setAuthor(author);
    reply.setText(text);
    Map<String, Object> created = replyToJson(replies.saveAndFlush(reply));
    audit.record(ownerId, thread.getDiagram().workspaceId(), "thread.reply", "thread",
        threadId.toString(), "ok");
    return created;
  }

  private ReviewThread requireThreadInDiagram(UUID ownerId, UUID diagramId, UUID threadId, boolean write) {
    if (write) {
      diagrams.requireOwnedForWrite(ownerId, diagramId);
    } else {
      diagrams.requireOwnedForRead(ownerId, diagramId);
    }
    Optional<ReviewThread> thread = threads.findByIdAndDiagram_Id(threadId, diagramId);
    if (thread.isEmpty()) {
      throw ApiException.notFound("Thread not found: " + threadId);
    }
    return thread.get();
  }

  public Map<String, Object> threadToJson(ReviewThread thread) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", thread.getId().toString());
    out.put("diagramId", thread.getDiagram().getId().toString());
    out.put("author", thread.getAuthor());
    // Contract input shape uses snake_case pinned_to; emit both spellings.
    out.put("pinned_to", thread.getPinnedTo());
    out.put("pinnedTo", thread.getPinnedTo());
    out.put("text", thread.getText());
    out.put("resolved", thread.isResolved());
    out.put("createdAt", thread.getCreatedAt() == null ? null : thread.getCreatedAt().toString());
    return out;
  }

  public Map<String, Object> replyToJson(Reply reply) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", reply.getId().toString());
    out.put("threadId", reply.getThread().getId().toString());
    out.put("author", reply.getAuthor());
    out.put("text", reply.getText());
    out.put("createdAt", reply.getCreatedAt() == null ? null : reply.getCreatedAt().toString());
    return out;
  }
}
