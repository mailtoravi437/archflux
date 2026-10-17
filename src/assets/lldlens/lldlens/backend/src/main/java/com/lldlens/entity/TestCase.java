package com.lldlens.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Type;
import java.util.Map;

@Entity
@Table(name = "test_cases")
@Getter
@Setter
public class TestCase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "problem_id", nullable = false)
    private Problem problem;

    @Column(name = "is_hidden", nullable = false)
    private boolean hidden = true;

    @Type(JsonType.class)
    @Column(name = "input_json", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> input;

    @Type(JsonType.class)
    @Column(name = "expected_output_json", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> expectedOutput;

    @Column(name = "display_order")
    private Integer displayOrder = 0;
}
