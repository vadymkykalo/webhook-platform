package com.webhook.platform.api.service.workflow;

import com.webhook.platform.api.domain.entity.WorkflowExecution;
import com.webhook.platform.api.domain.entity.WorkflowExecution.ExecutionStatus;
import com.webhook.platform.api.domain.entity.WorkflowStepExecution;
import com.webhook.platform.api.domain.repository.WorkflowExecutionRepository;
import com.webhook.platform.api.domain.repository.WorkflowStepExecutionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Separate bean for transactional persistence of workflow execution state.
 * Extracted from WorkflowEngine so that Spring AOP proxy intercepts
 * {@code @Transactional} — self-invocation within the same class would bypass it.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class WorkflowExecutionPersistence {

    private final WorkflowExecutionRepository executionRepository;
    private final WorkflowStepExecutionRepository stepRepository;
    private final ObjectMapper objectMapper;

    /**
     * Atomically update execution status + completedAt + durationMs + errorMessage.
     * findById + save run in a single transaction — no partial writes on crash.
     */
    @Transactional
    public void completeExecution(UUID executionId, ExecutionStatus status, String error, long startTime) {
        executionRepository.findById(executionId).ifPresent(exec -> {
            exec.setStatus(status);
            exec.setCompletedAt(Instant.now());
            exec.setDurationMs((int) (System.currentTimeMillis() - startTime));
            if (error != null) {
                exec.setErrorMessage(error.length() > 2000 ? error.substring(0, 2000) : error);
            }
            executionRepository.save(exec);
        });
    }

    /**
     * Save a step execution record transactionally (single DB write including duration).
     */
    @Transactional
    public WorkflowStepExecution saveStep(UUID executionId, String nodeId, String nodeType,
                                           JsonNode input, StepResult result, int durationMs) {
        return stepRepository.save(WorkflowStepExecution.builder()
                .executionId(executionId)
                .nodeId(nodeId)
                .nodeType(nodeType)
                .status(result.status())
                .inputData(jsonToString(input))
                .outputData(jsonToString(result.output()))
                .errorMessage(result.errorMessage())
                .durationMs(durationMs)
                .attemptCount(1)
                .startedAt(Instant.now())
                .completedAt(Instant.now())
                .build());
    }

    private String jsonToString(JsonNode node) {
        if (node == null) return null;
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception e) {
            return node.toString();
        }
    }
}
