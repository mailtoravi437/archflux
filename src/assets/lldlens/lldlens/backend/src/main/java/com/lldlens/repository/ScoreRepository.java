package com.lldlens.repository;

import com.lldlens.entity.Score;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ScoreRepository extends JpaRepository<Score, Long> {
    Optional<Score> findBySubmissionId(Long submissionId);
}
