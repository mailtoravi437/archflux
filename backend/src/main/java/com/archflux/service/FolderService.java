package com.archflux.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.archflux.domain.Folder;
import com.archflux.domain.Workspace;
import com.archflux.repo.DiagramRepository;
import com.archflux.repo.FolderRepository;
import jakarta.persistence.EntityManager;

/**
 * Library folders (R1-E06-T01). Every method is scoped to a workspace the
 * caller belongs to: new root folders go to the caller's personal workspace
 * (the "current" workspace until X-Workspace-ID lands in R1-E11), child
 * folders to their parent's workspace. Non-members get 404, members without
 * a writer role get 403. Trash and restore move a whole subtree, plus the
 * diagrams in it, with one shared {@code deleted_at} so a restore brings back
 * exactly that batch.
 */
@Service
public class FolderService {

  public static final int MAX_DEPTH = 5;
  public static final int MAX_NAME_LENGTH = 120;
  /** Guard against cycles when walking parent chains (depth is capped at 5). */
  private static final int MAX_WALK = 64;

  private final FolderRepository folders;
  private final DiagramRepository diagrams;
  private final WorkspaceService workspaceService;
  private final SchemaReadinessService readiness;
  private final AuditService audit;
  private final EntityManager entityManager;

  public FolderService(FolderRepository folders, DiagramRepository diagrams,
      WorkspaceService workspaceService, SchemaReadinessService readiness, AuditService audit,
      EntityManager entityManager) {
    this.folders = folders;
    this.diagrams = diagrams;
    this.workspaceService = workspaceService;
    this.readiness = readiness;
    this.audit = audit;
    this.entityManager = entityManager;
  }

  /** Live folders of the current workspace, or its trashed folders when {@code trashed}. */
  @Transactional
  public List<Map<String, Object>> list(UUID userId, boolean trashed) {
    readiness.requireReady();
    Workspace workspace = workspaceService.resolvePersonalWorkspace(userId);
    List<Folder> rows = trashed
        ? folders.findByWorkspaceIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(workspace.getId())
        : folders.findByWorkspaceIdAndDeletedAtIsNullOrderByNameAsc(workspace.getId());
    return rows.stream().map(FolderService::toJson).toList();
  }

  @Transactional
  public Map<String, Object> create(UUID userId, String name, UUID parentId) {
    readiness.requireReady();
    String clean = cleanName(name);
    UUID workspaceId;
    if (parentId != null) {
      Folder parent = requireUsableParent(userId, parentId, null);
      workspaceId = parent.getWorkspaceId();
      if (depthOf(parent) + 1 > MAX_DEPTH) {
        throw ApiException.unprocessable("Folders can be nested at most " + MAX_DEPTH + " levels deep");
      }
    } else {
      workspaceId = workspaceService.resolvePersonalWorkspace(userId).getId();
      workspaceService.requireRole(userId, workspaceId, WorkspaceService.WRITER_ROLES,
          "Workspace not found");
    }
    requireNameFree(workspaceId, parentId, clean, null);
    Folder saved = saveUnique(new Folder(workspaceId, parentId, clean, userId));
    audit.record(userId, workspaceId, "folder.create", "folder", saved.getId().toString(), "ok");
    return toJson(saved);
  }

  @Transactional
  public Map<String, Object> rename(UUID userId, UUID id, String name) {
    readiness.requireReady();
    String clean = cleanName(name);
    Folder folder = requireLiveForWrite(userId, id);
    requireNameFree(folder.getWorkspaceId(), folder.getParentId(), clean, folder.getId());
    folder.setName(clean);
    Folder saved = saveUnique(folder);
    audit.record(userId, folder.getWorkspaceId(), "folder.rename", "folder", id.toString(), "ok");
    return toJson(saved);
  }

  @Transactional
  public Map<String, Object> move(UUID userId, UUID id, UUID parentId) {
    readiness.requireReady();
    Folder folder = requireLiveForWrite(userId, id);
    if (parentId != null) {
      Folder parent = requireUsableParent(userId, parentId, folder.getWorkspaceId());
      if (folders.subtreeIds(folder.getId()).contains(parent.getId())) {
        throw ApiException.unprocessable("A folder cannot be moved into itself or its subfolders");
      }
      Integer height = folders.subtreeHeight(folder.getId());
      if (depthOf(parent) + (height == null ? 1 : height) > MAX_DEPTH) {
        throw ApiException.unprocessable("Folders can be nested at most " + MAX_DEPTH + " levels deep");
      }
    }
    requireNameFree(folder.getWorkspaceId(), parentId, folder.getName(), folder.getId());
    folder.setParentId(parentId);
    Folder saved = saveUnique(folder);
    audit.record(userId, folder.getWorkspaceId(), "folder.move", "folder", id.toString(), "ok");
    return toJson(saved);
  }

  /** PATCH: rename and/or move in one transaction (each audited separately). */
  @Transactional
  public Map<String, Object> update(UUID userId, UUID id, String name, boolean move,
      UUID parentId) {
    Map<String, Object> out = null;
    if (name != null) {
      out = rename(userId, id, name);
    }
    if (move) {
      out = move(userId, id, parentId);
    }
    if (out == null) {
      throw ApiException.validation("name or parentId is required");
    }
    return out;
  }

  /** Trashes the folder, its live subfolders and the live diagrams in them (one timestamp). */
  @Transactional
  public void trash(UUID userId, UUID id) {
    readiness.requireReady();
    Folder folder = requireLiveForWrite(userId, id);
    Instant at = Instant.now().truncatedTo(ChronoUnit.MICROS);
    List<UUID> subtree = folders.subtreeIds(folder.getId());
    entityManager.flush();
    folders.trashAll(subtree, at);
    diagrams.trashInFolders(folder.getWorkspaceId(), subtree, at);
    // Bulk updates bypass the persistence context: drop stale managed rows.
    entityManager.clear();
    audit.record(userId, folder.getWorkspaceId(), "folder.trash", "folder", id.toString(), "ok");
  }

  /**
   * Restores a trashed folder with the subfolders and diagrams trashed in the
   * same batch. Items trashed separately stay in the trash. When the parent
   * is gone or still trashed, the folder goes back to the root.
   */
  @Transactional
  public Map<String, Object> restore(UUID userId, UUID id) {
    readiness.requireReady();
    Folder folder = folders.findById(id)
        .filter(f -> f.getDeletedAt() != null)
        .orElseThrow(() -> ApiException.notFound("Folder not in trash: " + id));
    workspaceService.requireRole(userId, folder.getWorkspaceId(), WorkspaceService.WRITER_ROLES,
        "Folder not in trash: " + id);
    Instant at = folder.getDeletedAt();
    boolean toRoot = false;
    if (folder.getParentId() != null) {
      Optional<Folder> parent = folders.findById(folder.getParentId());
      if (parent.isEmpty() || parent.get().getDeletedAt() != null) {
        folder.setParentId(null);
        toRoot = true;
      }
    }
    requireNameFree(folder.getWorkspaceId(), folder.getParentId(), folder.getName(),
        folder.getId());
    List<UUID> subtree = folders.subtreeIds(folder.getId());
    folders.saveAndFlush(folder);
    folders.restoreBatch(subtree, at);
    diagrams.restoreInFolders(folder.getWorkspaceId(), subtree, at);
    entityManager.clear();
    Folder restored = folders.findById(id)
        .orElseThrow(() -> ApiException.notFound("Folder not found: " + id));
    audit.record(userId, folder.getWorkspaceId(), "folder.restore", "folder", id.toString(), "ok");
    Map<String, Object> out = toJson(restored);
    out.put("restoredTo", toRoot || restored.getParentId() == null ? "root" : "folder");
    return out;
  }

  /**
   * A live folder in a workspace the caller belongs to, usable for
   * diagram moves (R1-E06-T02): missing, trashed or foreign → 422.
   */
  @Transactional(readOnly = true)
  public Folder requireLiveTarget(UUID workspaceId, UUID folderId) {
    return folders.findById(folderId)
        .filter(f -> f.getDeletedAt() == null && f.getWorkspaceId().equals(workspaceId))
        .orElseThrow(() -> ApiException.unprocessable(
            "folderId is not a live folder in this diagram's workspace"));
  }

  /** True when the folder exists and is not in the trash. */
  @Transactional(readOnly = true)
  public boolean isLive(UUID folderId) {
    return folderId != null
        && folders.findById(folderId).map(f -> f.getDeletedAt() == null).orElse(false);
  }

  private Folder requireLiveForWrite(UUID userId, UUID id) {
    Folder folder = folders.findById(id)
        .filter(f -> f.getDeletedAt() == null)
        .orElseThrow(() -> ApiException.notFound("Folder not found: " + id));
    workspaceService.requireRole(userId, folder.getWorkspaceId(), WorkspaceService.WRITER_ROLES,
        "Folder not found: " + id);
    return folder;
  }

  /**
   * Parent for create/move. Missing, trashed, foreign (non-member) or (for a
   * move) other-workspace parents are 422 without revealing which; a member
   * whose role cannot write there gets 403.
   */
  private Folder requireUsableParent(UUID userId, UUID parentId, UUID requiredWorkspaceId) {
    Folder parent = folders.findById(parentId)
        .filter(f -> f.getDeletedAt() == null)
        .filter(f -> workspaceService.isMember(userId, f.getWorkspaceId()))
        .filter(f -> requiredWorkspaceId == null || f.getWorkspaceId().equals(requiredWorkspaceId))
        .orElseThrow(() -> ApiException.unprocessable("parentId is not a folder you can use"));
    workspaceService.requireRole(userId, parent.getWorkspaceId(), WorkspaceService.WRITER_ROLES,
        "Folder not found: " + parentId);
    return parent;
  }

  /** Depth of a folder: a root folder is 1. */
  private int depthOf(Folder folder) {
    int depth = 1;
    UUID cursor = folder.getParentId();
    while (cursor != null && depth < MAX_WALK) {
      Optional<Folder> next = folders.findById(cursor);
      if (next.isEmpty()) {
        break;
      }
      depth++;
      cursor = next.get().getParentId();
    }
    return depth;
  }

  private void requireNameFree(UUID workspaceId, UUID parentId, String name, UUID excludeId) {
    if (folders.existsLiveSibling(workspaceId, parentId, name, excludeId)) {
      throw ApiException.conflict("FOLDER_NAME_TAKEN",
          "A folder named \"" + name + "\" already exists here");
    }
  }

  /** The partial unique index is the race-proof backstop for requireNameFree. */
  private Folder saveUnique(Folder folder) {
    try {
      return folders.saveAndFlush(folder);
    } catch (DataIntegrityViolationException e) {
      throw ApiException.conflict("FOLDER_NAME_TAKEN",
          "A folder named \"" + folder.getName() + "\" already exists here");
    }
  }

  private static String cleanName(String name) {
    String clean = name == null ? "" : name.strip();
    if (clean.isEmpty()) {
      throw ApiException.validation("name is required");
    }
    if (clean.length() > MAX_NAME_LENGTH) {
      throw ApiException.validation("name must be at most " + MAX_NAME_LENGTH + " characters");
    }
    return clean;
  }

  public static Map<String, Object> toJson(Folder folder) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", folder.getId().toString());
    out.put("name", folder.getName());
    out.put("parentId", folder.getParentId() == null ? null : folder.getParentId().toString());
    out.put("createdAt", folder.getCreatedAt() == null ? null : folder.getCreatedAt().toString());
    out.put("deletedAt", folder.getDeletedAt() == null ? null : folder.getDeletedAt().toString());
    return out;
  }
}
