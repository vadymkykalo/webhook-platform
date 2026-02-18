package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.ProjectRequest;
import com.webhook.platform.api.dto.ProjectResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;

    public ProjectService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    @Transactional
    public ProjectResponse createProject(ProjectRequest request, UUID organizationId) {
        Project project = Project.builder()
                .name(request.getName())
                .organizationId(organizationId)
                .description(request.getDescription())
                .build();
        
        project = projectRepository.saveAndFlush(project);
        return mapToResponse(project);
    }

    public ProjectResponse getProject(UUID id, UUID organizationId) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
        
        return mapToResponse(project);
    }

    public List<ProjectResponse> listProjects(UUID organizationId) {
        return projectRepository.findAll().stream()
                .filter(p -> p.getDeletedAt() == null)
                .filter(p -> p.getOrganizationId().equals(organizationId))
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public ProjectResponse updateProject(UUID id, ProjectRequest request, UUID organizationId) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
        
        project.setName(request.getName());
        project.setDescription(request.getDescription());
        project = projectRepository.save(project);
        
        return mapToResponse(project);
    }

    @Transactional
    public void deleteProject(UUID id, UUID organizationId) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
        
        project.setDeletedAt(Instant.now());
        projectRepository.save(project);
    }

    private ProjectResponse mapToResponse(Project project) {
        return ProjectResponse.builder()
                .id(project.getId())
                .name(project.getName())
                .description(project.getDescription())
                .createdAt(project.getCreatedAt())
                .updatedAt(project.getUpdatedAt())
                .build();
    }
}
