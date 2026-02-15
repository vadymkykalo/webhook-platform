package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.DashboardStatsResponse;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/dashboard")
@Tag(name = "Projects", description = "Project dashboard and statistics")
@SecurityRequirement(name = "bearerAuth")
public class DashboardController {
    
    private final DashboardService dashboardService;
    
    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }
    
    @Operation(summary = "Get project dashboard", description = "Returns delivery statistics for a project")
    @GetMapping("/projects/{projectId}")
    public ResponseEntity<DashboardStatsResponse> getProjectDashboard(
            @PathVariable("projectId") UUID projectId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        
        log.info("Dashboard stats request for projectId: {}", projectId);
        
        DashboardStatsResponse stats = dashboardService.getProjectStats(projectId, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(stats);
    }
}
