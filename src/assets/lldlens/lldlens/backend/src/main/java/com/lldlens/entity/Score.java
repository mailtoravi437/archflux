package com.lldlens.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "scores")
@Getter
@Setter
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submission_id", nullable = false, unique = true)
    private Submission submission;

    @Column(name = "test_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal testScore = BigDecimal.ZERO;

    @Column(name = "rubric_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal rubricScore = BigDecimal.ZERO;

    @Column(name = "peer_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal peerScore = BigDecimal.ZERO;

    @Column(name = "composite_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal compositeScore = BigDecimal.ZERO;

    @Column(name = "computed_at", nullable = false)
    private Instant computedAt;

    @PrePersist
    @PreUpdate
    void onSave() {
        computedAt = Instant.now();
    }
}
