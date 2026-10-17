import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import ReactFlow, { Background, Controls, Node, Edge } from "reactflow";
import "reactflow/dist/style.css";
import { getProblemDetail } from "../../api/problems";
import { createDraft, runPublicTests, submitForScoring, updateDraft } from "../../api/submissions";
import { TestConsole } from "./TestConsole";
import { useSubmissionSocket } from "./useSubmissionSocket";

type Tab = "diagram" | "code" | "tests";

export function PracticeSessionPage() {
  const { problemId } = useParams<{ problemId: string }>();
  const numericProblemId = Number(problemId);

  const [tab, setTab] = useState<Tab>("code");
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [code, setCode] = useState("// design your classes here\n");
  const [nodes] = useState<Node[]>([]);
  const [edges] = useState<Edge[]>([]);

  const { data: problem } = useQuery({
    queryKey: ["problem", numericProblemId],
    queryFn: () => getProblemDetail(numericProblemId),
    enabled: Number.isFinite(numericProblemId),
  });

  // Create the draft submission once, on first load of this problem.
  useEffect(() => {
    if (Number.isFinite(numericProblemId) && submissionId === null) {
      createDraft(numericProblemId).then(setSubmissionId);
    }
  }, [numericProblemId, submissionId]);

  // Autosave code/diagram every 3s while there's a draft to save against.
  const autosaveTimer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (submissionId === null) return;
    autosaveTimer.current = setInterval(() => {
      updateDraft(submissionId, { code, diagram: { nodes, edges } });
    }, 3000);
    return () => clearInterval(autosaveTimer.current);
  }, [submissionId, code, nodes, edges]);

  const liveResults = useSubmissionSocket(submissionId);

  const runMutation = useMutation({
    mutationFn: () => runPublicTests(submissionId!),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitForScoring(submissionId!),
    onSuccess: () => {
      window.location.href = `/results/${submissionId}`;
    },
  });

  if (!problem) return <div>Loading problem…</div>;

  return (
    <div className="practice-session">
      <aside className="left-pane">
        <h2>{problem.title}</h2>
        <p>{problem.statementMd}</p>
        <h4>Requirements to consider</h4>
        <ul>
          {problem.requirementsChecklist.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <h4>Interface contract</h4>
        <pre>{JSON.stringify(problem.interfaceContract, null, 2)}</pre>
      </aside>

      <main className="right-pane">
        <div className="tab-bar">
          <button className={tab === "diagram" ? "active" : ""} onClick={() => setTab("diagram")}>
            UML Canvas
          </button>
          <button className={tab === "code" ? "active" : ""} onClick={() => setTab("code")}>
            Code Editor
          </button>
          <button className={tab === "tests" ? "active" : ""} onClick={() => setTab("tests")}>
            Test Console
          </button>
        </div>

        {tab === "diagram" && (
          <div style={{ height: 500 }}>
            <ReactFlow nodes={nodes} edges={edges} fitView>
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        )}

        {tab === "code" && (
          <Editor
            height="500px"
            defaultLanguage="java"
            value={code}
            onChange={(v) => setCode(v ?? "")}
          />
        )}

        {tab === "tests" && (
          <TestConsole
            liveResults={liveResults}
            onRun={() => runMutation.mutate()}
            isRunning={runMutation.isPending}
          />
        )}

        <div className="action-bar">
          <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </main>
    </div>
  );
}
