package com.lldlens.service;

import com.lldlens.dto.SubmissionDtos.*;
import com.lldlens.entity.*;
import com.lldlens.exception.ApiException;
import com.lldlens.exception.ResourceNotFoundException;
import com.lldlens.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final ProblemService problemService;
    private final TestCaseRepository testCaseRepository;
    private final JudgeResultRepository judgeResultRepository;
    private final JudgeDispatchService judgeDispatchService;
    private final ScoringService scoringService;
    private final SimpMessagingTemplate messagingTemplate;

    public SubmissionService(SubmissionRepository submissionRepository, ProblemService problemService,
                              TestCaseRepository testCaseRepository, JudgeResultRepository judgeResultRepository,
                              JudgeDispatchService judgeDispatchService, ScoringService scoringService,
                              SimpMessagingTemplate messagingTemplate) {
        this.submissionRepository = submissionRepository;
        this.problemService = problemService;
        this.testCaseRepository = testCaseRepository;
        this.judgeResultRepository = judgeResultRepository;
        this.judgeDispatchService = judgeDispatchService;
        this.scoringService = scoringService;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public Submission createDraft(User user, Long problemId) {
        Problem problem = problemService.getEntity(problemId);
        Submission submission = new Submission();
        submission.setUser(user);
        submission.setProblem(problem);
        return submissionRepository.save(submission);
    }

    @Transactional
    public Submission updateDraft(Long submissionId, User requester, UpdateDraftRequest req) {
        Submission submission = getOwned(submissionId, requester);
        if (req.code() != null) submission.setCode(req.code());
        if (req.language() != null) submission.setLanguage(req.language());
        if (req.diagram() != null) submission.setDiagram(req.diagram());
        return submissionRepository.save(submission);
    }

    /**
     * Runs the submission against either the public sample cases (scope=public,
     * used for the live Test Console) or the full hidden suite (scope=hidden,
     * used on final submit). Results stream over WebSocket per test case as
     * they complete, then the aggregate is persisted and returned.
     */
    @Transactional
    public RunResultResponse runTests(Long submissionId, User requester, boolean hiddenScope) {
        Submission submission = getOwned(submissionId, requester);
        submission.setStatus(Submission.Status.RUNNING);
        submissionRepository.save(submission);

        List<TestCase> cases = hiddenScope
                ? testCaseRepository.findByProblemIdOrderByDisplayOrder(submission.getProblem().getId())
                : testCaseRepository.findByProblemIdAndHiddenOrderByDisplayOrder(submission.getProblem().getId(), false);

        int passedCount = 0;
        List<TestCaseResult> results = new java.util.ArrayList<>();

        for (TestCase testCase : cases) {
            JudgeDispatchService.JudgeRunResult runResult = judgeDispatchService.run(submission, testCase);

            JudgeResult judgeResult = new JudgeResult();
            judgeResult.setSubmission(submission);
            judgeResult.setTestCase(testCase);
            judgeResult.setPassed(runResult.passed());
            judgeResult.setActualOutput(runResult.actualOutput());
            judgeResult.setRuntimeMs(runResult.runtimeMs());
            judgeResultRepository.save(judgeResult);

            if (runResult.passed()) passedCount++;

            TestCaseResult tcResult = new TestCaseResult(testCase.getId(), runResult.passed(),
                    runResult.actualOutput(), testCase.getExpectedOutput(), runResult.runtimeMs());
            results.add(tcResult);

            // Live push to the Test Console (Screen 3) — see WebSocketConfig.
            messagingTemplate.convertAndSend("/topic/submissions/" + submissionId, tcResult);
        }

        submission.setStatus(hiddenScope ? Submission.Status.SUBMITTED : Submission.Status.DRAFT);
        submissionRepository.save(submission);

        if (hiddenScope) {
            scoringService.recomputeTestScore(submission, passedCount, cases.size());
        }

        return new RunResultResponse(submissionId, cases.size(), passedCount, results);
    }

    public Submission getOwned(Long submissionId, User requester) {
        Submission submission = submissionRepository.findById(submissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Submission not found: " + submissionId));
        if (!submission.getUser().getId().equals(requester.getId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You do not own this submission");
        }
        return submission;
    }

    public List<Submission> listForUser(User user) {
        return submissionRepository.findByUserIdOrderByCreatedAtDesc(user.getId())
                .stream().collect(Collectors.toList());
    }
}
