package com.lldlens.service;

import com.lldlens.entity.Submission;
import com.lldlens.entity.TestCase;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Talks to the isolated sandbox judge service that actually compiles/executes
 * candidate code. This class deliberately knows NOTHING about how the sandbox
 * works internally (Docker-per-submission, Judge0, Firecracker, etc.) — it's
 * an HTTP client against a well-defined contract, so the sandbox implementation
 * can be swapped without touching anything upstream of this class.
 *
 * SECURITY NOTE: candidate code must NEVER be executed inside this backend
 * process. This service only dispatches to a network-isolated, resource-capped
 * sandbox and reads back structured results — never raw stdout that could be
 * used to smuggle other payloads.
 */
@Service
public class JudgeDispatchService {

    private final RestClient restClient;
    private final int timeoutSeconds;

    public JudgeDispatchService(@Value("${judge.sandbox-endpoint}") String sandboxEndpoint,
                                 @Value("${judge.timeout-seconds}") int timeoutSeconds) {
        this.restClient = RestClient.builder().baseUrl(sandboxEndpoint).build();
        this.timeoutSeconds = timeoutSeconds;
    }

    public record JudgeRunResult(boolean passed, Map<String, Object> actualOutput, int runtimeMs, String error) {}

    public JudgeRunResult run(Submission submission, TestCase testCase) {
        try {
            SandboxRequest req = new SandboxRequest(
                    submission.getLanguage().name(),
                    submission.getCode(),
                    testCase.getInput(),
                    timeoutSeconds
            );
            SandboxResponse resp = restClient.post()
                    .uri("/execute")
                    .body(req)
                    .retrieve()
                    .body(SandboxResponse.class);

            boolean passed = resp != null && resp.output() != null
                    && resp.output().equals(testCase.getExpectedOutput());
            return new JudgeRunResult(passed, resp == null ? null : resp.output(),
                    resp == null ? 0 : resp.runtimeMs(), resp == null ? "empty sandbox response" : null);
        } catch (Exception e) {
            // A sandbox failure (timeout, crash, OOM) is a FAILED test case, not a
            // 500 to the client — the candidate's submission simply didn't pass.
            return new JudgeRunResult(false, null, 0, e.getMessage());
        }
    }

    private record SandboxRequest(String language, String code, Map<String, Object> input, int timeoutSeconds) {}
    private record SandboxResponse(Map<String, Object> output, int runtimeMs) {}
}
