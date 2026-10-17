import { apiClient } from "./client";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export interface ProblemSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  companyTags: string[];
}

export interface ProblemDetail {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  statementMd: string;
  interfaceContract: Record<string, unknown>;
  requirementsChecklist: string[];
}

export interface ProblemSearchParams {
  difficulty?: Difficulty;
  company?: string;
  q?: string;
  page?: number;
  size?: number;
}

export async function searchProblems(params: ProblemSearchParams) {
  const { data } = await apiClient.get<{ content: ProblemSummary[]; totalElements: number }>(
    "/api/problems",
    { params }
  );
  return data;
}

export async function getProblemDetail(id: number) {
  const { data } = await apiClient.get<ProblemDetail>(`/api/problems/${id}`);
  return data;
}
