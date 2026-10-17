package com.lldlens.dto;

import com.lldlens.entity.Submission;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public class SubmissionDtos {

    public record CreateDraftRequest(@NotNull Long problemId) {}

    public record UpdateDraftRequest(String code, Submission.Language language, Map<String, Object> diagram) {}

    public record TestCaseResult(Long testCaseId, boolean passed, Map<String, Object> actualOutput,
                                  Map<String, Object> expectedOutput, Integer runtimeMs) {}

    public record RunResultResponse(Long submissionId, int totalCases, int passedCases,
                                     List<TestCaseResult> results) {}

    public record ScoreResponse(Long submissionId, BigDecimal testScore, BigDecimal rubricScore,
                                 BigDecimal peerScore, BigDecimal compositeScore) {}
}
