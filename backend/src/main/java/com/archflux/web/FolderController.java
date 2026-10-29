package com.archflux.web;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.security.RequestUser;
import com.archflux.service.ApiException;
import com.archflux.service.FolderService;
import com.archflux.web.dto.FolderRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.groups.Default;

/** Library folders (R1-E06-T01, DATA_MODEL_R1 §5). */
@RestController
@RequestMapping("/api/v1/folders")
@Tag(name = "Folders", description = "Library folders: create, rename, move, trash, restore")
public class FolderController {

  private final FolderService folders;

  public FolderController(FolderService folders) {
    this.folders = folders;
  }

  @Operation(summary = "List folders", description = "Live folders of the current workspace; trashed=true lists the trashed ones")
  @GetMapping
  public Map<String, Object> list(HttpServletRequest request,
      @RequestParam(defaultValue = "false") boolean trashed) {
    return Map.of("data", folders.list(RequestUser.get(request), trashed));
  }

  @Operation(summary = "Create folder")
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request,
      @Validated({Default.class, FolderRequest.OnCreate.class}) @RequestBody FolderRequest body) {
    Map<String, Object> created =
        folders.create(RequestUser.get(request), body.getName(), body.getParentId());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("data", created));
  }

  @Operation(summary = "Rename and/or move folder", description = "name renames; parentId moves (null = root)")
  @PatchMapping("/{id}")
  public Map<String, Object> update(HttpServletRequest request, @PathVariable UUID id,
      @Validated @RequestBody FolderRequest body) {
    if (body.getName() == null && !body.isParentIdPresent()) {
      throw ApiException.validation("name or parentId is required");
    }
    Map<String, Object> out = folders.update(RequestUser.get(request), id, body.getName(),
        body.isParentIdPresent(), body.getParentId());
    return Map.of("data", out);
  }

  @Operation(summary = "Move folder to trash", description = "Also trashes its subfolders and the diagrams in them")
  @DeleteMapping("/{id}")
  public ResponseEntity<Void> trash(HttpServletRequest request, @PathVariable UUID id) {
    folders.trash(RequestUser.get(request), id);
    return ResponseEntity.noContent().build();
  }

  @Operation(summary = "Restore folder from trash", description = "Restores the folder with the items trashed in the same batch")
  @PostMapping("/{id}/restore")
  public Map<String, Object> restore(HttpServletRequest request, @PathVariable UUID id) {
    return Map.of("data", folders.restore(RequestUser.get(request), id));
  }
}
