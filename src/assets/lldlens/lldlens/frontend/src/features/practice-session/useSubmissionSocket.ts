import { useEffect, useState } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { TestCaseResult } from "../../api/submissions";

const WS_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

/**
 * Subscribes to /topic/submissions/{id} so the Test Console can render each
 * test case's pass/fail the instant the backend's sandbox judge finishes it,
 * instead of polling. See backend SubmissionService.runTests + WebSocketConfig.
 */
export function useSubmissionSocket(submissionId: number | null) {
  const [results, setResults] = useState<TestCaseResult[]>([]);

  useEffect(() => {
    if (submissionId === null) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${WS_BASE_URL}/ws`),
      reconnectDelay: 3000,
    });

    client.onConnect = () => {
      client.subscribe(`/topic/submissions/${submissionId}`, (message) => {
        const result: TestCaseResult = JSON.parse(message.body);
        setResults((prev) => [...prev.filter((r) => r.testCaseId !== result.testCaseId), result]);
      });
    };

    client.activate();
    return () => { client.deactivate(); };
  }, [submissionId]);

  return results;
}
