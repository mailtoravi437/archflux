package com.lldlens.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Type;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "problems")
@Getter
@Setter
public class Problem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    @Column(nullable = false, length = 200)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Difficulty difficulty;

    @Column(name = "statement_md", nullable = false, columnDefinition = "TEXT")
    private String statementMd;

    @Type(JsonType.class)
    @Column(name = "interface_contract_json", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> interfaceContract;

    @Type(JsonType.class)
    @Column(name = "requirements_checklist_json", columnDefinition = "jsonb")
    private List<String> requirementsChecklist;

    @Type(JsonType.class)
    @Column(name = "expected_patterns_json", columnDefinition = "jsonb")
    private List<String> expectedPatterns;

    @Type(JsonType.class)
    @Column(name = "common_pitfalls_json", columnDefinition = "jsonb")
    private List<String> commonPitfalls;

    @Type(JsonType.class)
    @Column(name = "reference_diagram_json", columnDefinition = "jsonb")
    private Map<String, Object> referenceDiagram;

    @Column(name = "company_tags", columnDefinition = "text[]")
    private String[] companyTags;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public enum Difficulty { EASY, MEDIUM, HARD }
}
