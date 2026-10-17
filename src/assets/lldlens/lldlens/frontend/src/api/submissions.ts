import { apiClient } from "./client";

export interface TestCaseResult {
  testCaseId: number;
  passed: boolean;
  actualOutput: Record<string, unknown> | null;
  expectedOutput: Record<string, unknown>;
  runtimeMs: number | null;
}

export interface RunResultResponse {
  submissionId: number;
  totalCases: number;
  passedCases: number;
  results: TestCaseResult[];
}

export interface ScoreResponse {
  submissionId: number;
  testScore: number;
  rubricScore: number;
  peerScore: number;
  compositeScore: number;
}

export async function createDraft(problemId: number) {
  const { data } = await apiClient.post<number>("/api/submissions", { problemId });
  return data; // submission id
}

export async function updateDraft(
  submissionId: number,
  body: { code?: string; language?: string; diagram?: Record<string, unknown> }
) {
  await apiClient.patch(`/api/submissions/${submissionId}`, body);
}

export async function runPublicTests(submissionId: number) {
  const { data } = await apiClient.post<RunResultResponse>(`/api/submissions/${submissionId}/run`);
  return data;
}

export async function submitForScoring(submissionId: number) {
  const { data } = await apiClient.post<RunResultResponse>(`/api/submissions/${submissionId}/submit`);
  return data;
}

export async function getScore(submissionId: number) {
  const { data } = await apiClient.get<ScoreResponse>(`/api/submissions/${submissionId}/score`);
  return data;
}
