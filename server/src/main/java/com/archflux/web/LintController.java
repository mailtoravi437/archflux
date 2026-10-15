package com.archflux.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.service.LintService;
import com.archflux.web.dto.LintRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/lint")
@Tag(name = "Lint", description = "Architecture diagram linting - finds orphans, dangling wires, and ambiguous edges")
public class LintController {

  private final LintService lintService;

  public LintController(LintService lintService) {
    this.lintService = lintService;
  }

  @Operation(summary = "Lint diagram", description = "Analyzes diagram for orphans (degree 0 nodes), dangling wires (edges with null/missing target), and ambiguous edges (connected edges without protocol or label)")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Lint completed"),
    @ApiResponse(responseCode = "400", description = "Invalid request")
  })
  @PostMapping
  public Map<String, Object> lint(
      @Parameter(description = "Lint request with nodes and edges arrays", required = false) 
      @RequestBody(required = false) LintRequest body) {
    LintService.LintResult result = lintService.lint(
        body == null ? null : body.getNodes(), body == null ? null : body.getEdges());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("orphans", result.orphans());
    out.put("dangling", result.dangling());
    out.put("ambiguous", result.ambiguous());
    out.put("ok", result.ok());
    return out;
  }
}
