package com.webhook.platform.api.service.workflow.executors;

import com.fasterxml.jackson.databind.JsonNode;
import com.webhook.platform.api.service.workflow.NodeExecutor;
import com.webhook.platform.api.service.workflow.StepResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Delay node — pauses execution for a configurable number of seconds.
 * Config: delaySeconds (int, default 5, max 300).
 * Passes input through unchanged.
 */
@Component
@Slf4j
public class DelayNodeExecutor implements NodeExecutor {

    private static final int MAX_DELAY_SECONDS = 300;
    private static final int DEFAULT_DELAY_SECONDS = 5;

    @Override
    public String getType() {
        return "delay";
    }

    @Override
    public StepResult execute(JsonNode nodeConfig, JsonNode input) {
        try {
            int delaySeconds = DEFAULT_DELAY_SECONDS;
            if (nodeConfig.has("delaySeconds")) {
                delaySeconds = nodeConfig.get("delaySeconds").asInt(DEFAULT_DELAY_SECONDS);
            }
            delaySeconds = Math.max(1, Math.min(delaySeconds, MAX_DELAY_SECONDS));

            log.debug("Delay node: sleeping {} seconds", delaySeconds);
            Thread.sleep(delaySeconds * 1000L);

            return StepResult.success(input);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return StepResult.failed("Delay interrupted");
        } catch (Exception e) {
            log.error("Delay node execution failed: {}", e.getMessage(), e);
            return StepResult.failed("Delay error: " + e.getMessage());
        }
    }
}
