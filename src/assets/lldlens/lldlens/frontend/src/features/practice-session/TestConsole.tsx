import { TestCaseResult } from "../../api/submissions";

interface Props {
  liveResults: TestCaseResult[];
  onRun: () => void;
  isRunning: boolean;
}

export function TestConsole({ liveResults, onRun, isRunning }: Props) {
  return (
    <div className="test-console">
      <button onClick={onRun} disabled={isRunning}>
        {isRunning ? "Running…" : "Run Tests"}
      </button>

      <table>
        <thead>
          <tr><th>Case</th><th>Status</th><th>Expected</th><th>Actual</th><th>ms</th></tr>
        </thead>
        <tbody>
          {liveResults.map((r) => (
            <tr key={r.testCaseId} className={r.passed ? "row-pass" : "row-fail"}>
              <td>#{r.testCaseId}</td>
              <td>{r.passed ? "✓ Passed" : "✗ Failed"}</td>
              <td><code>{JSON.stringify(r.expectedOutput)}</code></td>
              <td><code>{JSON.stringify(r.actualOutput)}</code></td>
              <td>{r.runtimeMs ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
