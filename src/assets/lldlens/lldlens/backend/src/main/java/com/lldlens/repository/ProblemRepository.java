package com.lldlens.repository;

import com.lldlens.entity.Problem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface ProblemRepository extends JpaRepository<Problem, Long> {

    Optional<Problem> findBySlug(String slug);

    @Query("""
        SELECT p FROM Problem p
        WHERE (:difficulty IS NULL OR p.difficulty = :difficulty)
          AND (:company IS NULL OR :company = ANY(p.companyTags))
          AND (:q IS NULL OR p.title ILIKE CONCAT('%', :q, '%'))
        ORDER BY p.createdAt DESC
        """)
    Page<Problem> search(@Param("difficulty") Problem.Difficulty difficulty,
                          @Param("company") String company,
                          @Param("q") String q,
                          Pageable pageable);
}
