package com.lldlens.controller;

import com.lldlens.dto.SubmissionDtos.*;
import com.lldlens.entity.Submission;
import com.lldlens.entity.User;
import com.lldlens.exception.ResourceNotFoundException;
import com.lldlens.repository.UserRepository;
import com.lldlens.service.SubmissionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/submissions")
public class SubmissionController {

    private final SubmissionService submissionService;
    private final UserRepository userRepository;

    public SubmissionController(SubmissionService submissionService, UserRepository userRepository) {
        this.submissionService = submissionService;
        this.userRepository = userRepository;
    }

    @PostMapping
    public ResponseEntity<Long> createDraft(@Valid @RequestBody CreateDraftRequest req, Authentication auth) {
        Submission submission = submissionService.createDraft(currentUser(auth), req.problemId());
        return ResponseEntity.ok(submission.getId());
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Void> updateDraft(@PathVariable Long id, @RequestBody UpdateDraftRequest req,
                                             Authentication auth) {
        submissionService.updateDraft(id, currentUser(auth), req);
        return ResponseEntity.noContent().build();
    }

    // Runs against the public sample cases only — used by the live Test Console.
    @PostMapping("/{id}/run")
    public ResponseEntity<RunResultResponse> run(@PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(submissionService.runTests(id, currentUser(auth), false));
    }

    // Runs the full hidden suite and finalizes the test-score component.
    @PostMapping("/{id}/submit")
    public ResponseEntity<RunResultResponse> submit(@PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(submissionService.runTests(id, currentUser(auth), true));
    }

    private User currentUser(Authentication auth) {
        // auth.getName() is the email — see JwtService/UserDetailsServiceImpl.
        return userRepository.findByEmail(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Authenticated user not found"));
    }
}
