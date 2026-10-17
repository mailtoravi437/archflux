package com.lldlens.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Type;
import java.time.Instant;
import java.util.Map;

@Entity
@Table(name = "judge_results", uniqueConstraints = @UniqueConstraint(columnNames = {"submission_id", "test_case_id"}))
@Getter
@Setter
public class JudgeResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id", nullable = false)
    private Submission submission;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "test_case_id", nullable = false)
    private TestCase testCase;

    @Column(nullable = false)
    private boolean passed;

    @Type(JsonType.class)
    @Column(name = "actual_output_json", columnDefinition = "jsonb")
    private Map<String, Object> actualOutput;

    @Column(name = "runtime_ms")
    private Integer runtimeMs;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }
}
