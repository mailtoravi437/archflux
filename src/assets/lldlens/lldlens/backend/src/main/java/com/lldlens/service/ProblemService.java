package com.lldlens.service;

import com.lldlens.dto.ProblemDtos.*;
import com.lldlens.entity.Problem;
import com.lldlens.exception.ResourceNotFoundException;
import com.lldlens.repository.ProblemRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class ProblemService {

    private final ProblemRepository problemRepository;

    public ProblemService(ProblemRepository problemRepository) {
        this.problemRepository = problemRepository;
    }

    public Page<ProblemSummary> search(Problem.Difficulty difficulty, String company, String q, Pageable pageable) {
        return problemRepository.search(difficulty, company, q, pageable).map(ProblemSummary::from);
    }

    public ProblemDetail getDetail(Long id) {
        Problem problem = problemRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Problem not found: " + id));
        return ProblemDetail.from(problem);
    }

    // Internal use only (judge/scoring services need the full entity, including
    // the reference diagram and hidden test contract) — never exposed via a controller.
    public Problem getEntity(Long id) {
        return problemRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Problem not found: " + id));
    }
}
