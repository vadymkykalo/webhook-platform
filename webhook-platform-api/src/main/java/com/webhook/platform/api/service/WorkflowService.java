package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.entity.Workflow;
import com.webhook.platform.api.domain.entity.WorkflowExecution;
import com.webhook.platform.api.domain.entity.WorkflowExecution.ExecutionStatus;
import com.webhook.platform.api.domain.entity.WorkflowStepExecution;
import com.webhook.platform.api.domain.repository.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.webhook.platform.api.dto.WorkflowExecutionResponse;
import com.webhook.platform.api.dto.WorkflowExecutionResponse.StepExecutionResponse;
import com.webhook.platform.api.dto.WorkflowRequest;
import com.webhook.platform.api.dto.WorkflowResponse;
import com.webhook.platform.api.exception.ConflictException;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.api.service.workflow.WorkflowEngine;
import com.webhook.platform.api.service.workflow.WorkflowTriggerService;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class WorkflowService {

    private final WorkflowRepository workflowRepository;
    private final WorkflowExecutionRepository executionRepository;
    private final WorkflowStepExecutionRepository stepExecutionRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper objectMapper;
    private final WorkflowEngine workflowEngine;

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    @Transactional
    public WorkflowResponse create(UUID projectId, WorkflowRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);

        if (workflowRepository.existsByProjectIdAndName(projectId, request.getName())) {
            throw new ConflictException("Workflow with this name already exists");
        }

        Workflow workflow = Workflow.builder()
                .projectId(projectId)
                .name(request.getName())
                .description(request.getDescription())
                .enabled(request.getEnabled() != null ? request.getEnabled() : false)
                .definition(serializeJson(request.getDefinition()))
                .triggerType(request.getTriggerType() != null ? request.getTriggerType() : Workflow.TriggerType.WEBHOOK_EVENT)
                .triggerConfig(serializeJson(request.getTriggerConfig()))
                .build();

        workflow = workflowRepository.save(workflow);
        log.info("Created workflow '{}' for project {}", workflow.getName(), projectId);
        return mapToResponse(workflow);
    }

    public WorkflowResponse get(UUID id, UUID organizationId) {
        Workflow workflow = workflowRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        validateProjectOwnership(workflow.getProjectId(), organizationId);
        return mapToResponse(workflow);
    }

    public List<WorkflowResponse> list(UUID projectId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        return workflowRepository.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public WorkflowResponse update(UUID id, WorkflowRequest request, UUID organizationId) {
        Workflow workflow = workflowRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        validateProjectOwnership(workflow.getProjectId(), organizationId);

        // Check name uniqueness if changed
        if (!workflow.getName().equals(request.getName()) &&
                workflowRepository.existsByProjectIdAndName(workflow.getProjectId(), request.getName())) {
            throw new ConflictException("Workflow with this name already exists");
        }

        workflow.setName(request.getName());
        workflow.setDescription(request.getDescription());
        if (request.getEnabled() != null) {
            workflow.setEnabled(request.getEnabled());
        }
        if (request.getDefinition() != null) {
            workflow.setDefinition(serializeJson(request.getDefinition()));
            workflow.setVersion(workflow.getVersion() + 1);
        }
        if (request.getTriggerType() != null) {
            workflow.setTriggerType(request.getTriggerType());
        }
        if (request.getTriggerConfig() != null) {
            workflow.setTriggerConfig(serializeJson(request.getTriggerConfig()));
        }

        workflow = workflowRepository.save(workflow);
        log.info("Updated workflow '{}' (v{})", workflow.getName(), workflow.getVersion());
        return mapToResponse(workflow);
    }

    @Transactional
    public void delete(UUID id, UUID organizationId) {
        Workflow workflow = workflowRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        validateProjectOwnership(workflow.getProjectId(), organizationId);
        workflowRepository.delete(workflow);
        log.info("Deleted workflow '{}'", workflow.getName());
    }

    @Transactional
    public WorkflowResponse toggleEnabled(UUID id, boolean enabled, UUID organizationId) {
        Workflow workflow = workflowRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        validateProjectOwnership(workflow.getProjectId(), organizationId);
        workflow.setEnabled(enabled);
        workflow = workflowRepository.save(workflow);
        log.info("Workflow '{}' {}", workflow.getName(), enabled ? "enabled" : "disabled");
        return mapToResponse(workflow);
    }

    // ── Manual trigger ───────────────────────────────────────────────────

    public WorkflowExecutionResponse manualTrigger(UUID workflowId, UUID organizationId, Object testPayload) {
        Workflow workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        validateProjectOwnership(workflow.getProjectId(), organizationId);

        String payloadStr;
        JsonNode payloadJson;
        try {
            payloadStr = testPayload != null ? objectMapper.writeValueAsString(testPayload) : "{}";
            payloadJson = objectMapper.readTree(payloadStr);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid test payload: " + e.getMessage());
        }

        WorkflowExecution execution = executionRepository.save(WorkflowExecution.builder()
                .workflowId(workflowId)
                .triggerData(payloadStr)
                .build());

        log.info("Manual trigger workflow '{}' (id={}), execution={}", workflow.getName(), workflowId, execution.getId());

        try {
            WorkflowTriggerService.setCurrentDepth(0);
            workflowEngine.execute(execution.getId(), workflow.getDefinition(), payloadJson);
        } finally {
            WorkflowTriggerService.clearCurrentDepth();
        }

        // Re-fetch to get updated status
        execution = executionRepository.findById(execution.getId()).orElse(execution);
        return getExecution(execution.getId(), organizationId);
    }

    // ── Executions ──────────────────────────────────────────────────────

    public Page<WorkflowExecutionResponse> listExecutions(UUID workflowId, UUID organizationId, int page, int size) {
        Workflow workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        validateProjectOwnership(workflow.getProjectId(), organizationId);

        return executionRepository.findByWorkflowIdOrderByStartedAtDesc(workflowId, PageRequest.of(page, size))
                .map(this::mapExecutionToResponse);
    }

    public WorkflowExecutionResponse getExecution(UUID executionId, UUID organizationId) {
        WorkflowExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new NotFoundException("Execution not found"));

        Workflow workflow = workflowRepository.findById(execution.getWorkflowId())
                .orElseThrow(() -> new NotFoundException("Workflow not found"));
        validateProjectOwnership(workflow.getProjectId(), organizationId);

        WorkflowExecutionResponse response = mapExecutionToResponse(execution);
        List<WorkflowStepExecution> steps = stepExecutionRepository.findByExecutionIdOrderByCreatedAtAsc(executionId);
        response.setSteps(steps.stream().map(this::mapStepToResponse).collect(Collectors.toList()));
        return response;
    }

    // ── Mapping ─────────────────────────────────────────────────────────

    private WorkflowResponse mapToResponse(Workflow w) {
        long total = executionRepository.countByWorkflowIdAndStatus(w.getId(), ExecutionStatus.COMPLETED)
                + executionRepository.countByWorkflowIdAndStatus(w.getId(), ExecutionStatus.FAILED)
                + executionRepository.countByWorkflowIdAndStatus(w.getId(), ExecutionStatus.RUNNING);
        long success = executionRepository.countByWorkflowIdAndStatus(w.getId(), ExecutionStatus.COMPLETED);
        long failed = executionRepository.countByWorkflowIdAndStatus(w.getId(), ExecutionStatus.FAILED);

        return WorkflowResponse.builder()
                .id(w.getId())
                .projectId(w.getProjectId())
                .name(w.getName())
                .description(w.getDescription())
                .enabled(w.getEnabled())
                .definition(parseJson(w.getDefinition()))
                .triggerType(w.getTriggerType())
                .triggerConfig(parseJson(w.getTriggerConfig()))
                .version(w.getVersion())
                .createdAt(w.getCreatedAt())
                .updatedAt(w.getUpdatedAt())
                .totalExecutions(total)
                .successfulExecutions(success)
                .failedExecutions(failed)
                .build();
    }

    private WorkflowExecutionResponse mapExecutionToResponse(WorkflowExecution e) {
        return WorkflowExecutionResponse.builder()
                .id(e.getId())
                .workflowId(e.getWorkflowId())
                .triggerEventId(e.getTriggerEventId())
                .status(e.getStatus())
                .triggerData(parseJson(e.getTriggerData()))
                .startedAt(e.getStartedAt())
                .completedAt(e.getCompletedAt())
                .errorMessage(e.getErrorMessage())
                .durationMs(e.getDurationMs())
                .build();
    }

    private StepExecutionResponse mapStepToResponse(WorkflowStepExecution s) {
        return StepExecutionResponse.builder()
                .id(s.getId())
                .nodeId(s.getNodeId())
                .nodeType(s.getNodeType())
                .status(s.getStatus())
                .inputData(parseJson(s.getInputData()))
                .outputData(parseJson(s.getOutputData()))
                .errorMessage(s.getErrorMessage())
                .attemptCount(s.getAttemptCount())
                .durationMs(s.getDurationMs())
                .startedAt(s.getStartedAt())
                .completedAt(s.getCompletedAt())
                .build();
    }

    // ── JSON helpers ────────────────────────────────────────────────────

    private String serializeJson(Object obj) {
        if (obj == null) return "{}";
        if (obj instanceof String s) return s;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            log.warn("Failed to serialize JSON: {}", e.getMessage());
            return "{}";
        }
    }

    private Object parseJson(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            return json;
        }
    }
}
