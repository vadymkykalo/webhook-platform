package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.audit.AuditAction;
import com.webhook.platform.api.audit.Auditable;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.entity.Transformation;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.domain.repository.SubscriptionRepository;
import com.webhook.platform.api.domain.repository.TransformationRepository;
import com.webhook.platform.api.dto.TransformationRequest;
import com.webhook.platform.api.dto.TransformationResponse;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TransformationService {

    private final TransformationRepository transformationRepository;
    private final ProjectRepository projectRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final IncomingDestinationRepository incomingDestinationRepository;
    private final ObjectMapper objectMapper;

    private static final Pattern EXPRESSION_PATTERN = Pattern.compile("\\$\\{([^}]*)\\}");

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    private void validateTemplate(String template) {
        if (template == null || template.isBlank()) {
            return;
        }
        try {
            objectMapper.readTree(template);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid template: not valid JSON - " + e.getMessage());
        }
        // Validate ${...} expressions — each must start with $.
        Matcher matcher = EXPRESSION_PATTERN.matcher(template);
        while (matcher.find()) {
            String expr = matcher.group(1).trim();
            if (expr.isEmpty()) {
                throw new IllegalArgumentException("Invalid template: empty expression ${} found");
            }
            if (!expr.startsWith("$")) {
                throw new IllegalArgumentException("Invalid template: expression '" + expr + "' must start with '$' (JSONPath)");
            }
        }
    }

    @Auditable(action = AuditAction.CREATE, resourceType = "Transformation")
    @Transactional
    public TransformationResponse create(UUID projectId, TransformationRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        validateTemplate(request.getTemplate());

        if (transformationRepository.existsByProjectIdAndName(projectId, request.getName())) {
            throw new IllegalArgumentException("Transformation with name '" + request.getName() + "' already exists in this project");
        }

        Transformation transformation = Transformation.builder()
                .projectId(projectId)
                .name(request.getName())
                .description(request.getDescription())
                .template(request.getTemplate())
                .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                .version(1)
                .build();

        transformation = transformationRepository.saveAndFlush(transformation);
        log.info("Created transformation: id={}, project={}", transformation.getId(), projectId);
        return mapToResponse(transformation);
    }

    public TransformationResponse get(UUID id, UUID organizationId) {
        Transformation transformation = transformationRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Transformation not found"));
        validateProjectOwnership(transformation.getProjectId(), organizationId);
        return mapToResponse(transformation);
    }

    public List<TransformationResponse> list(UUID projectId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        return transformationRepository.findByProjectIdOrderByNameAsc(projectId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Auditable(action = AuditAction.UPDATE, resourceType = "Transformation")
    @Transactional
    public TransformationResponse update(UUID id, TransformationRequest request, UUID organizationId) {
        Transformation transformation = transformationRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Transformation not found"));
        validateProjectOwnership(transformation.getProjectId(), organizationId);

        if (request.getName() != null && !request.getName().isBlank()) {
            if (transformationRepository.existsByProjectIdAndNameAndIdNot(
                    transformation.getProjectId(), request.getName(), id)) {
                throw new IllegalArgumentException("Transformation with name '" + request.getName() + "' already exists in this project");
            }
            transformation.setName(request.getName());
        }
        if (request.getDescription() != null) {
            transformation.setDescription(request.getDescription());
        }
        if (request.getTemplate() != null && !request.getTemplate().isBlank()) {
            validateTemplate(request.getTemplate());
            transformation.setTemplate(request.getTemplate());
            transformation.setVersion(transformation.getVersion() + 1);
        }
        if (request.getEnabled() != null) {
            transformation.setEnabled(request.getEnabled());
        }

        transformation = transformationRepository.saveAndFlush(transformation);
        log.info("Updated transformation: id={}, version={}", id, transformation.getVersion());
        return mapToResponse(transformation);
    }

    @Auditable(action = AuditAction.DELETE, resourceType = "Transformation")
    @Transactional
    public void delete(UUID id, UUID organizationId) {
        Transformation transformation = transformationRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Transformation not found"));
        validateProjectOwnership(transformation.getProjectId(), organizationId);

        long subCount = subscriptionRepository.countByTransformationId(id);
        long destCount = incomingDestinationRepository.countByTransformationId(id);
        if (subCount + destCount > 0) {
            List<String> refs = new java.util.ArrayList<>();
            if (subCount > 0) refs.add(subCount + " subscription" + (subCount > 1 ? "s" : ""));
            if (destCount > 0) refs.add(destCount + " destination" + (destCount > 1 ? "s" : ""));
            throw new IllegalStateException("Cannot delete transformation: it is referenced by " + String.join(" and ", refs));
        }

        transformationRepository.delete(transformation);
        log.info("Deleted transformation: id={}", id);
    }

    private TransformationResponse mapToResponse(Transformation transformation) {
        return TransformationResponse.builder()
                .id(transformation.getId())
                .projectId(transformation.getProjectId())
                .name(transformation.getName())
                .description(transformation.getDescription())
                .template(transformation.getTemplate())
                .version(transformation.getVersion())
                .enabled(transformation.getEnabled())
                .createdAt(transformation.getCreatedAt())
                .updatedAt(transformation.getUpdatedAt())
                .build();
    }
}
