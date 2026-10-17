CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    reputation      INTEGER      NOT NULL DEFAULT 0,
    role            VARCHAR(20)  NOT NULL DEFAULT 'USER',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE problems (
    id                          BIGSERIAL PRIMARY KEY,
    slug                        VARCHAR(120) NOT NULL UNIQUE,
    title                       VARCHAR(200) NOT NULL,
    difficulty                  VARCHAR(20)  NOT NULL,
    statement_md                TEXT         NOT NULL,
    interface_contract_json     JSONB        NOT NULL,
    requirements_checklist_json JSONB        NOT NULL DEFAULT '[]',
    expected_patterns_json      JSONB        NOT NULL DEFAULT '[]',
    common_pitfalls_json        JSONB        NOT NULL DEFAULT '[]',
    reference_diagram_json      JSONB        NOT NULL DEFAULT '{}',
    company_tags                TEXT[]       NOT NULL DEFAULT '{}',
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_problems_title_trgm ON problems USING gin (title gin_trgm_ops);
CREATE INDEX idx_problems_difficulty ON problems (difficulty);
CREATE INDEX idx_problems_company_tags ON problems USING gin (company_tags);

CREATE TABLE test_cases (
    id                  BIGSERIAL PRIMARY KEY,
    problem_id          BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    is_hidden           BOOLEAN NOT NULL DEFAULT true,
    input_json          JSONB   NOT NULL,
    expected_output_json JSONB  NOT NULL,
    display_order       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_test_cases_problem_id ON test_cases (problem_id);

CREATE TABLE submissions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id    BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    battle_id     BIGINT NULL,
    code          TEXT,
    language      VARCHAR(20) NOT NULL DEFAULT 'JAVA',
    diagram_json  JSONB       NOT NULL DEFAULT '{}',
    status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT',  -- DRAFT, RUNNING, SUBMITTED, SCORED
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_submissions_user_id ON submissions (user_id);
CREATE INDEX idx_submissions_problem_id ON submissions (problem_id);

CREATE TABLE judge_results (
    id              BIGSERIAL PRIMARY KEY,
    submission_id   BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    test_case_id    BIGINT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    passed          BOOLEAN NOT NULL,
    actual_output_json JSONB,
    runtime_ms      INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (submission_id, test_case_id)
);

CREATE TABLE rubric_self_assessments (
    id                     BIGSERIAL PRIMARY KEY,
    submission_id          BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    checklist_answers_json JSONB NOT NULL DEFAULT '{}',
    self_score             INTEGER,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
    id                    BIGSERIAL PRIMARY KEY,
    submission_id         BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    reviewer_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dimension_scores_json JSONB NOT NULL DEFAULT '{}',
    comments_json         JSONB NOT NULL DEFAULT '[]',
    upvotes               INTEGER NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_submission_id ON reviews (submission_id);

CREATE TABLE scores (
    id               BIGSERIAL PRIMARY KEY,
    submission_id    BIGINT NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
    test_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
    rubric_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
    peer_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
    composite_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE battles (
    id          BIGSERIAL PRIMARY KEY,
    problem_id  BIGINT NOT NULL REFERENCES problems(id),
    week_start  DATE NOT NULL,
    week_end    DATE NOT NULL
);

CREATE TABLE badges (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_type  VARCHAR(50) NOT NULL,
    awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
