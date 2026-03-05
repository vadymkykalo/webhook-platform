package com.webhook.platform.api.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.audit.AuditAction;
import com.webhook.platform.api.audit.Auditable;
import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.entity.Rule;
import com.webhook.platform.api.domain.entity.RuleAction;
import com.webhook.platform.api.domain.entity.RuleAction.ActionType;
import com.webhook.platform.api.domain.entity.Transformation;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.*;
import com.webhook.platform.api.exception.ConflictException;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.api.service.rules.RuleEngineService;
import com.webhook.platform.common.util.EventTypeMatcher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class RuleService {

    private final RuleRepository ruleRepository;
    private final RuleActionRepository ruleActionRepository;
    private final RuleExecutionLogRepository executionLogRepository;
    private final ProjectRepository projectRepository;
    private final EndpointRepository endpointRepository;
    private final TransformationRepository transformationRepository;
    private final RuleEngineService ruleEngineService;
    private final ObjectMapper objectMapper;

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    @Auditable(action = AuditAction.CREATE, resourceType = "Rule")
    @Transactional
    public RuleResponse create(UUID projectId, RuleRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);

        if (ruleRepository.existsByProjectIdAndName(projectId, request.getName())) {
            throw new ConflictException("Rule with this name already exists");
        }

        if (request.getEventTypePattern() != null && !request.getEventTypePattern().isBlank()) {
            if (!EventTypeMatcher.isValidPattern(request.getEventTypePattern())) {
                throw new IllegalArgumentException("Invalid event type pattern: " + request.getEventTypePattern());
            }
        }

        String conditionsJson = serializeConditions(request.getConditions());

        Rule rule = Rule.builder()
                .projectId(projectId)
                .name(request.getName())
                .description(request.getDescription())
                .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                .priority(request.getPriority() != null ? request.getPriority() : 0)
                .eventTypePattern(request.getEventTypePattern())
                .conditions(conditionsJson)
                .conditionsOperator(request.getConditionsOperator() != null ? request.getConditionsOperator() : "AND")
                .build();

        rule = ruleRepository.saveAndFlush(rule);

        if (request.getActions() != null && !request.getActions().isEmpty()) {
            saveActions(rule.getId(), request.getActions());
        }

        ruleEngineService.invalidate(projectId);
        log.info("Created rule '{}' for project {}", rule.getName(), projectId);
        return mapToResponse(rule);
    }

    public RuleResponse get(UUID id, UUID organizationId) {
        Rule rule = ruleRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Rule not found"));
        validateProjectOwnership(rule.getProjectId(), organizationId);
        return mapToResponse(rule);
    }

    public List<RuleResponse> list(UUID projectId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        return ruleRepository.findByProjectIdOrderByPriorityDescCreatedAtDesc(projectId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Auditable(action = AuditAction.UPDATE, resourceType = "Rule")
    @Transactional
    public RuleResponse update(UUID id, RuleRequest request, UUID organizationId) {
        Rule rule = ruleRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Rule not found"));
        validateProjectOwnership(rule.getProjectId(), organizationId);

        if (request.getName() != null) {
            if (!rule.getName().equals(request.getName()) &&
                    ruleRepository.existsByProjectIdAndName(rule.getProjectId(), request.getName())) {
                throw new ConflictException("Rule with this name already exists");
            }
            rule.setName(request.getName());
        }
        if (request.getDescription() != null) {
            rule.setDescription(request.getDescription());
        }
        if (request.getEnabled() != null) {
            rule.setEnabled(request.getEnabled());
        }
        if (request.getPriority() != null) {
            rule.setPriority(request.getPriority());
        }
        if (request.getEventTypePattern() != null) {
            if (!request.getEventTypePattern().isBlank() &&
                    !EventTypeMatcher.isValidPattern(request.getEventTypePattern())) {
                throw new IllegalArgumentException("Invalid event type pattern: " + request.getEventTypePattern());
            }
            rule.setEventTypePattern(request.getEventTypePattern().isBlank() ? null : request.getEventTypePattern());
        }
        if (request.getConditions() != null) {
            rule.setConditions(serializeConditions(request.getConditions()));
        }
        if (request.getConditionsOperator() != null) {
            rule.setConditionsOperator(request.getConditionsOperator());
        }

        rule = ruleRepository.saveAndFlush(rule);

        if (request.getActions() != null) {
            ruleActionRepository.deleteByRuleId(id);
            ruleActionRepository.flush();
            saveActions(id, request.getActions());
        }

        ruleEngineService.invalidate(rule.getProjectId());
        log.info("Updated rule '{}' ({})", rule.getName(), id);
        return mapToResponse(rule);
    }

    @Auditable(action = AuditAction.DELETE, resourceType = "Rule")
    @Transactional
    public void delete(UUID id, UUID organizationId) {
        Rule rule = ruleRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Rule not found"));
        validateProjectOwnership(rule.getProjectId(), organizationId);

        UUID projectId = rule.getProjectId();
        ruleRepository.deleteById(id);
        ruleEngineService.invalidate(projectId);
        log.info("Deleted rule '{}' ({})", rule.getName(), id);
    }

    @Transactional
    public RuleResponse toggleEnabled(UUID id, boolean enabled, UUID organizationId) {
        Rule rule = ruleRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Rule not found"));
        validateProjectOwnership(rule.getProjectId(), organizationId);

        rule.setEnabled(enabled);
        rule = ruleRepository.saveAndFlush(rule);
        ruleEngineService.invalidate(rule.getProjectId());
        return mapToResponse(rule);
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private void saveActions(UUID ruleId, List<RuleActionRequest> actions) {
        for (int i = 0; i < actions.size(); i++) {
            RuleActionRequest actionReq = actions.get(i);

            ActionType actionType = actionReq.getType();

            // Validate endpoint exists for ROUTE
            if (actionType == ActionType.ROUTE) {
                if (actionReq.getEndpointId() == null) {
                    throw new IllegalArgumentException("ROUTE action requires endpointId");
                }
                endpointRepository.findById(actionReq.getEndpointId())
                        .orElseThrow(() -> new NotFoundException("Endpoint not found for ROUTE action"));
            }

            // Validate transformation exists for TRANSFORM
            if (actionType == ActionType.TRANSFORM) {
                if (actionReq.getTransformationId() == null) {
                    throw new IllegalArgumentException("TRANSFORM action requires transformationId");
                }
                transformationRepository.findById(actionReq.getTransformationId())
                        .orElseThrow(() -> new NotFoundException("Transformation not found for TRANSFORM action"));
            }

            String configJson;
            try {
                configJson = actionReq.getConfig() != null
                        ? objectMapper.writeValueAsString(actionReq.getConfig())
                        : "{}";
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid action config JSON");
            }

            ruleActionRepository.save(RuleAction.builder()
                    .ruleId(ruleId)
                    .type(actionType)
                    .endpointId(actionReq.getEndpointId())
                    .transformationId(actionReq.getTransformationId())
                    .config(configJson)
                    .sortOrder(actionReq.getSortOrder() != null ? actionReq.getSortOrder() : i)
                    .build());
        }
    }

    private String serializeConditions(List<RuleCondition> conditions) {
        if (conditions == null || conditions.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(conditions);
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to serialize conditions: " + e.getMessage());
        }
    }

    private RuleResponse mapToResponse(Rule rule) {
        List<RuleCondition> conditions;
        try {
            conditions = objectMapper.readValue(rule.getConditions(), new TypeReference<>() {});
        } catch (Exception e) {
            conditions = List.of();
        }

        List<RuleAction> actionEntities = ruleActionRepository.findByRuleIdOrderBySortOrderAsc(rule.getId());
        List<RuleActionResponse> actionResponses = actionEntities.stream()
                .map(this::mapActionToResponse)
                .collect(Collectors.toList());

        long totalExec = executionLogRepository.countByRuleId(rule.getId());
        long totalMatches = executionLogRepository.countByRuleIdAndMatchedTrue(rule.getId());

        return RuleResponse.builder()
                .id(rule.getId())
                .projectId(rule.getProjectId())
                .name(rule.getName())
                .description(rule.getDescription())
                .enabled(rule.getEnabled())
                .priority(rule.getPriority())
                .eventTypePattern(rule.getEventTypePattern())
                .conditions(conditions)
                .conditionsOperator(rule.getConditionsOperator())
                .actions(actionResponses)
                .totalExecutions(totalExec)
                .totalMatches(totalMatches)
                .createdAt(rule.getCreatedAt())
                .updatedAt(rule.getUpdatedAt())
                .build();
    }

    private RuleActionResponse mapActionToResponse(RuleAction action) {
        String endpointUrl = null;
        if (action.getEndpointId() != null) {
            endpointUrl = endpointRepository.findById(action.getEndpointId())
                    .map(Endpoint::getUrl)
                    .orElse(null);
        }
        String transformationName = null;
        if (action.getTransformationId() != null) {
            transformationName = transformationRepository.findById(action.getTransformationId())
                    .map(Transformation::getName)
                    .orElse(null);
        }

        Object config;
        try {
            config = objectMapper.readValue(action.getConfig(), Object.class);
        } catch (Exception e) {
            config = Map.of();
        }

        return RuleActionResponse.builder()
                .id(action.getId())
                .type(action.getType())
                .endpointId(action.getEndpointId())
                .endpointUrl(endpointUrl)
                .transformationId(action.getTransformationId())
                .transformationName(transformationName)
                .config(config)
                .sortOrder(action.getSortOrder())
                .createdAt(action.getCreatedAt())
                .build();
    }
}
