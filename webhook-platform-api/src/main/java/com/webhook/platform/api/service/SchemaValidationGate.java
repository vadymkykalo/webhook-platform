package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.SchemaValidationPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Checks an event's payload against the schema registered for its type, before the event is
 * stored. A project with validation off is let through untouched.
 *
 * <p>The policy decides what a failure costs: BLOCK refuses the event, anything else records the
 * errors and lets it past.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SchemaValidationGate {

    private final SchemaRegistryService schemaRegistryService;
    private final ObjectMapper objectMapper;

    public void check(Project project, UUID projectId, String eventType, Object payload) {
        if (project == null || !Boolean.TRUE.equals(project.getSchemaValidationEnabled())) {
            return;
        }

        String payloadJson;
        try {
            payloadJson = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to serialize event payload", e);
        }

        schemaRegistryService.autoDiscover(projectId, eventType, payloadJson);

        List<String> errors = schemaRegistryService.validatePayload(projectId, eventType, payloadJson);
        if (errors.isEmpty()) {
            return;
        }
        log.warn("Schema validation failed for event type '{}': {}", eventType, errors);
        if (project.getSchemaValidationPolicy() == SchemaValidationPolicy.BLOCK) {
            throw new IllegalArgumentException("Schema validation failed: " + String.join("; ", errors));
        }
    }
}
