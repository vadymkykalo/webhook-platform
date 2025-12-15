package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.EndpointRequest;
import com.webhook.platform.api.dto.EndpointResponse;
import com.webhook.platform.api.service.EndpointService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/projects/{projectId}/endpoints")
public class EndpointController {

    private final EndpointService endpointService;

    public EndpointController(EndpointService endpointService) {
        this.endpointService = endpointService;
    }

    @PostMapping
    public ResponseEntity<EndpointResponse> createEndpoint(
            @PathVariable("projectId") UUID projectId,
            @RequestBody EndpointRequest request) {
        try {
            EndpointResponse response = endpointService.createEndpoint(projectId, request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            log.error("Failed to create endpoint for project {}: {}", projectId, e.getMessage(), e);
            throw e;
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<EndpointResponse> getEndpoint(@PathVariable("id") UUID id) {
        EndpointResponse response = endpointService.getEndpoint(id);
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<List<EndpointResponse>> listEndpoints(@PathVariable("projectId") UUID projectId) {
        List<EndpointResponse> response = endpointService.listEndpoints(projectId);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<EndpointResponse> updateEndpoint(
            @PathVariable("id") UUID id,
            @RequestBody EndpointRequest request) {
        EndpointResponse response = endpointService.updateEndpoint(id, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEndpoint(@PathVariable("id") UUID id) {
        endpointService.deleteEndpoint(id);
        return ResponseEntity.noContent().build();
    }
}
