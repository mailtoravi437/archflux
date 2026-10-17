package com.lldlens.controller;

import com.lldlens.dto.ProblemDtos.*;
import com.lldlens.entity.Problem;
import com.lldlens.service.ProblemService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/problems")
public class ProblemController {

    private final ProblemService problemService;

    public ProblemController(ProblemService problemService) {
        this.problemService = problemService;
    }

    @GetMapping
    public ResponseEntity<Page<ProblemSummary>> search(
            @RequestParam(required = false) Problem.Difficulty difficulty,
            @RequestParam(required = false) String company,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(problemService.search(difficulty, company, q, PageRequest.of(page, size)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProblemDetail> getDetail(@PathVariable Long id) {
        return ResponseEntity.ok(problemService.getDetail(id));
    }
}
