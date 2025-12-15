package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.ProjectRequest;
import com.webhook.platform.api.dto.ProjectResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    public ProjectResponse createProject(ProjectRequest request) {
        Project project = Project.builder()
                .name(request.getName())
                .description(request.getDescription())
                .build();
        
        project = projectRepository.save(project);
        return mapToResponse(project);
    }

    public ProjectResponse getProject(UUID id) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        return mapToResponse(project);
    }

    public List<ProjectResponse> listProjects() {
        return projectRepository.findAll().stream()
                .filter(p -> p.getDeletedAt() == null)
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public ProjectResponse updateProject(UUID id, ProjectRequest request) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        
        project.setName(request.getName());
        project.setDescription(request.getDescription());
        project = projectRepository.save(project);
        
        return mapToResponse(project);
    }

    @Transactional
    public void deleteProject(UUID id) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        
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
