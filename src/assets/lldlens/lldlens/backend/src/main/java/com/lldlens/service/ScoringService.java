package com.lldlens.service;

import com.lldlens.entity.Score;
import com.lldlens.entity.Submission;
import com.lldlens.repository.ScoreRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Computes the composite score per the weighting decided for the platform:
 * 70% automated test correctness, 20% design rubric, 10% peer review.
 * Recomputed idempotently whenever any one component changes.
 */
@Service
public class ScoringService {

    private static final BigDecimal TEST_WEIGHT = new BigDecimal("0.70");
    private static final BigDecimal RUBRIC_WEIGHT = new BigDecimal("0.20");
    private static final BigDecimal PEER_WEIGHT = new BigDecimal("0.10");

    private final ScoreRepository scoreRepository;

    public ScoringService(ScoreRepository scoreRepository) {
        this.scoreRepository = scoreRepository;
    }

    @Transactional
    public Score recomputeTestScore(Submission submission, int passedCases, int totalCases) {
        Score score = scoreRepository.findBySubmissionId(submission.getId())
                .orElseGet(() -> newScoreFor(submission));

        BigDecimal testScore = totalCases == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(passedCases)
                    .divide(BigDecimal.valueOf(totalCases), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));

        score.setTestScore(testScore.setScale(2, RoundingMode.HALF_UP));
        recomputeComposite(score);
        return scoreRepository.save(score);
    }

    @Transactional
    public Score recomputeRubricScore(Submission submission, BigDecimal rubricScoreOutOf100) {
        Score score = scoreRepository.findBySubmissionId(submission.getId())
                .orElseGet(() -> newScoreFor(submission));
        score.setRubricScore(rubricScoreOutOf100.setScale(2, RoundingMode.HALF_UP));
        recomputeComposite(score);
        return scoreRepository.save(score);
    }

    @Transactional
    public Score recomputePeerScore(Submission submission, BigDecimal peerScoreOutOf100) {
        Score score = scoreRepository.findBySubmissionId(submission.getId())
                .orElseGet(() -> newScoreFor(submission));
        score.setPeerScore(peerScoreOutOf100.setScale(2, RoundingMode.HALF_UP));
        recomputeComposite(score);
        return scoreRepository.save(score);
    }

    private void recomputeComposite(Score score) {
        BigDecimal composite = score.getTestScore().multiply(TEST_WEIGHT)
                .add(score.getRubricScore().multiply(RUBRIC_WEIGHT))
                .add(score.getPeerScore().multiply(PEER_WEIGHT));
        score.setCompositeScore(composite.setScale(2, RoundingMode.HALF_UP));
    }

    private Score newScoreFor(Submission submission) {
        Score score = new Score();
        score.setSubmission(submission);
        return score;
    }
}
