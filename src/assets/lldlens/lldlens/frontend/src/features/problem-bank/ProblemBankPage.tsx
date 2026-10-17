import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { searchProblems, Difficulty } from "../../api/problems";

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

export function ProblemBankPage() {
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>();
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["problems", difficulty, query],
    queryFn: () => searchProblems({ difficulty, q: query || undefined, page: 0, size: 20 }),
  });

  return (
    <div className="problem-bank">
      <h1>Problem Bank</h1>

      <div className="filters">
        <input
          placeholder="Search problems…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          value={difficulty ?? ""}
          onChange={(e) => setDifficulty((e.target.value || undefined) as Difficulty | undefined)}
        >
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="skeleton-grid">Loading…</div>}
      {isError && <div className="error-state">Couldn't load problems. Try again.</div>}

      {data && data.content.length === 0 && (
        <div className="empty-state">No problems match those filters.</div>
      )}

      <div className="problem-grid">
        {data?.content.map((problem) => (
          <button
            key={problem.id}
            className="problem-card"
            onClick={() => navigate(`/practice/${problem.id}`)}
          >
            <h3>{problem.title}</h3>
            <span className={`pill pill-${problem.difficulty.toLowerCase()}`}>
              {problem.difficulty}
            </span>
            <div className="tags">
              {problem.companyTags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
