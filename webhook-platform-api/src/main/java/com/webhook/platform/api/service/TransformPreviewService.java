package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.webhook.platform.api.dto.TransformPreviewRequest;
import com.webhook.platform.api.dto.TransformPreviewResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class TransformPreviewService {

    private final ObjectMapper objectMapper;

    public TransformPreviewResponse preview(TransformPreviewRequest request) {
        List<String> errors = new ArrayList<>();
        String outputPayload = null;
        String outputHeaders = null;

        // Validate input JSON
        JsonNode root;
        try {
            root = objectMapper.readTree(request.getInputPayload());
        } catch (Exception e) {
            errors.add("Invalid input JSON: " + e.getMessage());
            return TransformPreviewResponse.builder()
                    .success(false)
                    .errors(errors)
                    .build();
        }

        // Apply dot-notation pointer transform if provided (e.g. "$.data" -> "/data", "$.data.items" -> "/data/items")
        if (request.getTransformExpression() != null && !request.getTransformExpression().isBlank()) {
            try {
                String expr = request.getTransformExpression().trim();
                // Convert simple JSONPath-like $.field.sub to JSON Pointer /field/sub
                String pointer = expr;
                if (pointer.startsWith("$.")) {
                    pointer = "/" + pointer.substring(2).replace(".", "/");
                } else if (pointer.startsWith("$")) {
                    // $ alone = root
                    pointer = "";
                } else if (!pointer.startsWith("/")) {
                    pointer = "/" + pointer.replace(".", "/");
                }

                JsonNode result = pointer.isEmpty() ? root : root.at(pointer);
                if (result.isMissingNode()) {
                    errors.add("Expression matched no data: " + request.getTransformExpression());
                    outputPayload = "null";
                } else {
                    outputPayload = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(result);
                }
            } catch (Exception e) {
                errors.add("Transform error: " + e.getMessage());
            }
        } else {
            // No transform = passthrough
            try {
                outputPayload = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root);
            } catch (Exception e) {
                errors.add("JSON formatting error: " + e.getMessage());
            }
        }

        // Validate custom headers JSON
        if (request.getCustomHeaders() != null && !request.getCustomHeaders().isBlank()) {
            try {
                JsonNode headersNode = objectMapper.readTree(request.getCustomHeaders());
                if (!headersNode.isObject()) {
                    errors.add("Custom headers must be a JSON object");
                } else {
                    outputHeaders = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(headersNode);
                }
            } catch (Exception e) {
                errors.add("Invalid custom headers JSON: " + e.getMessage());
            }
        }

        return TransformPreviewResponse.builder()
                .outputPayload(outputPayload)
                .outputHeaders(outputHeaders)
                .success(errors.isEmpty())
                .errors(errors)
                .build();
    }
}
