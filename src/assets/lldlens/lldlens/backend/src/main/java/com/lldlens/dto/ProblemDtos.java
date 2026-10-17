package com.lldlens.dto;

import com.lldlens.entity.Problem;
import java.util.List;
import java.util.Map;

public class ProblemDtos {

    // Summary shown in the Problem Bank grid — deliberately excludes the
    // interface contract / reference solution so those aren't leaked pre-attempt.
    public record ProblemSummary(
            Long id,
            String slug,
            String title,
            Problem.Difficulty difficulty,
            String[] companyTags
    ) {
        public static ProblemSummary from(Problem p) {
            return new ProblemSummary(p.getId(), p.getSlug(), p.getTitle(), p.getDifficulty(), p.getCompanyTags());
        }
    }

    // Full detail shown once a candidate opens the Practice Session (Screen 3).
    // Still excludes referenceDiagram and commonPitfalls — those are revealed
    // only after submission, on the Results screen.
    public record ProblemDetail(
            Long id,
            String slug,
            String title,
            Problem.Difficulty difficulty,
            String statementMd,
            Map<String, Object> interfaceContract,
            List<String> requirementsChecklist
    ) {
        public static ProblemDetail from(Problem p) {
            return new ProblemDetail(p.getId(), p.getSlug(), p.getTitle(), p.getDifficulty(),
                    p.getStatementMd(), p.getInterfaceContract(), p.getRequirementsChecklist());
        }
    }
}
