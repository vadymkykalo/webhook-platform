package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.CapturedRequest;
import com.webhook.platform.api.domain.entity.TestEndpoint;
import com.webhook.platform.api.domain.repository.CapturedRequestRepository;
import com.webhook.platform.api.domain.repository.TestEndpointRepository;
import com.webhook.platform.api.dto.CapturedRequestResponse;
import com.webhook.platform.api.dto.TestEndpointRequest;
import com.webhook.platform.api.dto.TestEndpointResponse;
import com.webhook.platform.api.exception.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class TestEndpointService {

    private final TestEndpointRepository testEndpointRepository;
    private final CapturedRequestRepository capturedRequestRepository;

    @Value("${test-endpoint.base-url:http://localhost:8080}")
    private String baseUrl;

    @Value("${test-endpoint.max-per-project:10}")
    private int maxPerProject;

    @Value("${test-endpoint.max-ttl-hours:72}")
    private int maxTtlHours;

    private static final String SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int SLUG_LENGTH = 8;
    private static final SecureRandom RANDOM = new SecureRandom();

    @Transactional
    public TestEndpointResponse create(UUID projectId, TestEndpointRequest request) {
        long count = testEndpointRepository.countByProjectId(projectId);
        if (count >= maxPerProject) {
            throw new IllegalStateException("Maximum test endpoints limit reached (" + maxPerProject + ")");
        }

        int ttlHours = request.getTtlHours() != null ? request.getTtlHours() : 24;
        ttlHours = Math.min(ttlHours, maxTtlHours);

        String slug = generateUniqueSlug();

        TestEndpoint endpoint = TestEndpoint.builder()
                .projectId(projectId)
                .slug(slug)
                .name(request.getName())
                .description(request.getDescription())
                .expiresAt(Instant.now().plus(ttlHours, ChronoUnit.HOURS))
                .build();

        endpoint = testEndpointRepository.saveAndFlush(endpoint);
        log.info("Created test endpoint {} for project {}", slug, projectId);

        return mapToResponse(endpoint);
    }

    public List<TestEndpointResponse> list(UUID projectId) {
        return testEndpointRepository.findByProjectIdOrderByCreatedAtDesc(projectId)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public TestEndpointResponse get(UUID projectId, UUID id) {
        TestEndpoint endpoint = testEndpointRepository.findById(id)
                .filter(e -> e.getProjectId().equals(projectId))
                .orElseThrow(() -> new NotFoundException("Test endpoint not found"));
        return mapToResponse(endpoint);
    }

    public TestEndpointResponse getBySlug(String slug) {
        TestEndpoint endpoint = testEndpointRepository.findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("Test endpoint not found"));
        
        if (endpoint.getExpiresAt().isBefore(Instant.now())) {
            throw new NotFoundException("Test endpoint expired");
        }
        
        return mapToResponse(endpoint);
    }

    @Transactional
    public void delete(UUID projectId, UUID id) {
        TestEndpoint endpoint = testEndpointRepository.findById(id)
                .filter(e -> e.getProjectId().equals(projectId))
                .orElseThrow(() -> new NotFoundException("Test endpoint not found"));

        capturedRequestRepository.deleteByTestEndpointId(id);
        testEndpointRepository.delete(endpoint);
        log.info("Deleted test endpoint {}", id);
    }

    @Transactional
    public CapturedRequestResponse captureRequest(String slug, HttpServletRequest request) {
        TestEndpoint endpoint = testEndpointRepository.findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("Test endpoint not found"));

        if (endpoint.getExpiresAt().isBefore(Instant.now())) {
            throw new NotFoundException("Test endpoint expired");
        }

        String body = readBody(request);
        String headers = extractHeaders(request);

        CapturedRequest captured = CapturedRequest.builder()
                .testEndpointId(endpoint.getId())
                .method(request.getMethod())
                .path(request.getRequestURI())
                .queryString(request.getQueryString())
                .headers(headers)
                .body(body)
                .contentType(request.getContentType())
                .sourceIp(getClientIp(request))
                .userAgent(request.getHeader("User-Agent"))
                .build();

        captured = capturedRequestRepository.saveAndFlush(captured);

        endpoint.setRequestCount(endpoint.getRequestCount() + 1);
        testEndpointRepository.save(endpoint);

        log.debug("Captured request {} for test endpoint {}", captured.getId(), slug);

        return mapToCapturedResponse(captured);
    }

    public Page<CapturedRequestResponse> getRequests(UUID projectId, UUID testEndpointId, Pageable pageable) {
        TestEndpoint endpoint = testEndpointRepository.findById(testEndpointId)
                .filter(e -> e.getProjectId().equals(projectId))
                .orElseThrow(() -> new NotFoundException("Test endpoint not found"));

        return capturedRequestRepository.findByTestEndpointIdOrderByReceivedAtDesc(endpoint.getId(), pageable)
                .map(this::mapToCapturedResponse);
    }

    @Transactional
    public void clearRequests(UUID projectId, UUID testEndpointId) {
        TestEndpoint endpoint = testEndpointRepository.findById(testEndpointId)
                .filter(e -> e.getProjectId().equals(projectId))
                .orElseThrow(() -> new NotFoundException("Test endpoint not found"));

        capturedRequestRepository.deleteByTestEndpointId(testEndpointId);
        endpoint.setRequestCount(0);
        testEndpointRepository.save(endpoint);
        log.info("Cleared requests for test endpoint {}", testEndpointId);
    }

    private String generateUniqueSlug() {
        for (int i = 0; i < 10; i++) {
            String slug = generateSlug();
            if (testEndpointRepository.findBySlug(slug).isEmpty()) {
                return slug;
            }
        }
        throw new IllegalStateException("Failed to generate unique slug");
    }

    private String generateSlug() {
        StringBuilder sb = new StringBuilder(SLUG_LENGTH);
        for (int i = 0; i < SLUG_LENGTH; i++) {
            sb.append(SLUG_CHARS.charAt(RANDOM.nextInt(SLUG_CHARS.length())));
        }
        return sb.toString();
    }

    private String readBody(HttpServletRequest request) {
        try {
            BufferedReader reader = request.getReader();
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            return sb.toString().trim();
        } catch (Exception e) {
            log.warn("Failed to read request body: {}", e.getMessage());
            return "";
        }
    }

    private String extractHeaders(HttpServletRequest request) {
        Map<String, String> headers = new HashMap<>();
        Enumeration<String> headerNames = request.getHeaderNames();
        while (headerNames.hasMoreElements()) {
            String name = headerNames.nextElement();
            headers.put(name, request.getHeader(name));
        }
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(headers);
        } catch (Exception e) {
            return "{}";
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isEmpty()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private TestEndpointResponse mapToResponse(TestEndpoint endpoint) {
        return TestEndpointResponse.builder()
                .id(endpoint.getId().toString())
                .projectId(endpoint.getProjectId().toString())
                .slug(endpoint.getSlug())
                .url(baseUrl + "/hook/" + endpoint.getSlug())
                .name(endpoint.getName())
                .description(endpoint.getDescription())
                .createdAt(endpoint.getCreatedAt())
                .expiresAt(endpoint.getExpiresAt())
                .requestCount(endpoint.getRequestCount())
                .build();
    }

    private CapturedRequestResponse mapToCapturedResponse(CapturedRequest request) {
        return CapturedRequestResponse.builder()
                .id(request.getId().toString())
                .testEndpointId(request.getTestEndpointId().toString())
                .method(request.getMethod())
                .path(request.getPath())
                .queryString(request.getQueryString())
                .headers(request.getHeaders())
                .body(request.getBody())
                .contentType(request.getContentType())
                .sourceIp(request.getSourceIp())
                .userAgent(request.getUserAgent())
                .receivedAt(request.getReceivedAt())
                .build();
    }
}
