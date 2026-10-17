package com.lldlens.controller;

import com.lldlens.dto.SubmissionDtos.ScoreResponse;
import com.lldlens.entity.Score;
import com.lldlens.exception.ResourceNotFoundException;
import com.lldlens.repository.ScoreRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/submissions")
public class ScoreController {

    private final ScoreRepository scoreRepository;

    public ScoreController(ScoreRepository scoreRepository) {
        this.scoreRepository = scoreRepository;
    }

    @GetMapping("/{id}/score")
    public ResponseEntity<ScoreResponse> getScore(@PathVariable("id") Long submissionId) {
        Score score = scoreRepository.findBySubmissionId(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("No score yet for submission " + submissionId));
        return ResponseEntity.ok(new ScoreResponse(submissionId, score.getTestScore(), score.getRubricScore(),
                score.getPeerScore(), score.getCompositeScore()));
    }
}
