package com.lldlens.repository;

import com.lldlens.entity.TestCase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface TestCaseRepository extends JpaRepository<TestCase, Long> {
    List<TestCase> findByProblemIdAndHiddenOrderByDisplayOrder(Long problemId, boolean hidden);
    List<TestCase> findByProblemIdOrderByDisplayOrder(Long problemId);
}
