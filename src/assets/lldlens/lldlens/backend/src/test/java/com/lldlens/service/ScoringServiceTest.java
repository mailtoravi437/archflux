package com.lldlens.service;

import com.lldlens.entity.Score;
import com.lldlens.entity.Submission;
import com.lldlens.repository.ScoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Unit test for the weighted-composite scoring logic (70% test / 20% rubric / 10% peer).
 * This is the calculation the entire "test-based judging is the majority signal"
 * product decision hinges on, so it's pinned down explicitly here.
 */
class ScoringServiceTest {

    @Mock
    private ScoreRepository scoreRepository;

    private ScoringService scoringService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        scoringService = new ScoringService(scoreRepository);
        when(scoreRepository.save(any(Score.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void compositeScore_weightsTestScoreAtSeventyPercent() {
        Submission submission = new Submission();
        submission.setId(1L);

        when(scoreRepository.findBySubmissionId(1L)).thenReturn(Optional.empty());
        Score afterTest = scoringService.recomputeTestScore(submission, 18, 20); // 90%

        when(scoreRepository.findBySubmissionId(1L)).thenReturn(Optional.of(afterTest));
        Score afterRubric = scoringService.recomputeRubricScore(submission, new BigDecimal("80")); // 20%

        when(scoreRepository.findBySubmissionId(1L)).thenReturn(Optional.of(afterRubric));
        Score afterPeer = scoringService.recomputePeerScore(submission, new BigDecimal("70")); // 10%

        // 90*0.7 + 80*0.2 + 70*0.1 = 63 + 16 + 7 = 86.00
        assertThat(afterPeer.getCompositeScore()).isEqualByComparingTo("86.00");
    }

    @Test
    void testScore_isZeroWhenNoCasesExist() {
        Submission submission = new Submission();
        submission.setId(2L);
        when(scoreRepository.findBySubmissionId(2L)).thenReturn(Optional.empty());

        Score score = scoringService.recomputeTestScore(submission, 0, 0);

        assertThat(score.getTestScore()).isEqualByComparingTo("0.00");
    }
}
