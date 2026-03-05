package com.webhook.platform.api.service.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.webhook.platform.api.domain.entity.WorkflowStepExecution.StepStatus;

public record StepResult(StepStatus status, JsonNode output, String errorMessage) {

    public static StepResult success(JsonNode output) {
        return new StepResult(StepStatus.SUCCESS, output, null);
    }

    public static StepResult failed(String error) {
        return new StepResult(StepStatus.FAILED, null, error);
    }

    public static StepResult skipped(String reason) {
        return new StepResult(StepStatus.SKIPPED, null, reason);
    }
}
