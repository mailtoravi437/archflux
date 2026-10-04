package com.archflux.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.archflux.service.LintService;
import com.archflux.web.dto.LintRequest;

@RestController
@RequestMapping("/api/v1/lint")
public class LintController {

  private final LintService lintService;

  public LintController(LintService lintService) {
    this.lintService = lintService;
  }

  @PostMapping
  public Map<String, Object> lint(@RequestBody(required = false) LintRequest body) {
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
