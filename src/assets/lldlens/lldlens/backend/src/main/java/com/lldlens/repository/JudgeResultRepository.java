package com.lldlens.repository;

import com.lldlens.entity.JudgeResult;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface JudgeResultRepository extends JpaRepository<JudgeResult, Long> {
    List<JudgeResult> findBySubmissionId(Long submissionId);
}
