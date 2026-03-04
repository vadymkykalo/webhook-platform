package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jayway.jsonpath.Configuration;
import com.jayway.jsonpath.JsonPath;
import com.jayway.jsonpath.Option;
import com.jayway.jsonpath.spi.json.JacksonJsonNodeJsonProvider;
import com.jayway.jsonpath.spi.mapper.JacksonMappingProvider;
import com.webhook.platform.api.domain.entity.Transformation;
import com.webhook.platform.api.domain.repository.TransformationRepository;
import com.webhook.platform.api.dto.TransformPreviewRequest;
import com.webhook.platform.api.dto.TransformPreviewResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class TransformPreviewService {

    private final ObjectMapper objectMapper;
    private final TransformationRepository transformationRepository;

    private static final Pattern JSONPATH_PATTERN = Pattern.compile("\\$\\{([^}]+)}");

    private final Configuration jsonPathConfig = Configuration.builder()
            .jsonProvider(new JacksonJsonNodeJsonProvider())
            .mappingProvider(new JacksonMappingProvider())
            .options(Option.SUPPRESS_EXCEPTIONS)
            .build();

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

        // Resolve template: transformationId > template > transformExpression > passthrough
        String resolvedTemplate = null;

        if (request.getTransformationId() != null) {
            Transformation transformation = transformationRepository.findById(request.getTransformationId())
                    .orElse(null);
            if (transformation == null) {
                errors.add("Transformation not found: " + request.getTransformationId());
            } else {
                resolvedTemplate = transformation.getTemplate();
            }
        } else if (request.getTemplate() != null && !request.getTemplate().isBlank()) {
            resolvedTemplate = request.getTemplate();
        }

        if (!errors.isEmpty()) {
            return TransformPreviewResponse.builder()
                    .success(false)
                    .errors(errors)
                    .build();
        }

        if (resolvedTemplate != null) {
            // Full template-based transform with ${$.path} expressions
            try {
                JsonNode templateNode = objectMapper.readTree(resolvedTemplate);
                JsonNode resultNode = processNode(templateNode, root);
                outputPayload = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(resultNode);
            } catch (Exception e) {
                errors.add("Template transform error: " + e.getMessage());
            }
        } else if (request.getTransformExpression() != null && !request.getTransformExpression().isBlank()) {
            // Simple JSONPath pointer extraction ($.data → /data)
            try {
                String expr = request.getTransformExpression().trim();
                String pointer = expr;
                if (pointer.startsWith("$.")) {
                    pointer = "/" + pointer.substring(2).replace(".", "/");
                } else if (pointer.startsWith("$")) {
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

    // ── Template processing (mirrors PayloadTransformService in worker) ──

    private JsonNode processNode(JsonNode templateNode, JsonNode sourceNode) {
        if (templateNode.isObject()) {
            return processObject((ObjectNode) templateNode, sourceNode);
        } else if (templateNode.isArray()) {
            return processArray((ArrayNode) templateNode, sourceNode);
        } else if (templateNode.isTextual()) {
            return processTextValue(templateNode.asText(), sourceNode);
        } else {
            return templateNode.deepCopy();
        }
    }

    private ObjectNode processObject(ObjectNode templateObject, JsonNode sourceNode) {
        ObjectNode result = objectMapper.createObjectNode();
        Iterator<Map.Entry<String, JsonNode>> fields = templateObject.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            result.set(field.getKey(), processNode(field.getValue(), sourceNode));
        }
        return result;
    }

    private ArrayNode processArray(ArrayNode templateArray, JsonNode sourceNode) {
        ArrayNode result = objectMapper.createArrayNode();
        for (JsonNode element : templateArray) {
            result.add(processNode(element, sourceNode));
        }
        return result;
    }

    private JsonNode processTextValue(String text, JsonNode sourceNode) {
        Matcher matcher = JSONPATH_PATTERN.matcher(text);
        if (matcher.matches()) {
            String jsonPath = matcher.group(1);
            return evaluateJsonPath(jsonPath, sourceNode);
        } else if (matcher.find()) {
            matcher.reset();
            StringBuffer sb = new StringBuffer();
            while (matcher.find()) {
                String jsonPath = matcher.group(1);
                JsonNode value = evaluateJsonPath(jsonPath, sourceNode);
                String replacement = value != null
                        ? (value.isTextual() ? value.asText() : value.toString()) : "";
                matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
            }
            matcher.appendTail(sb);
            return objectMapper.getNodeFactory().textNode(sb.toString());
        } else {
            return objectMapper.getNodeFactory().textNode(text);
        }
    }

    private JsonNode evaluateJsonPath(String jsonPath, JsonNode sourceNode) {
        try {
            Object result = JsonPath.using(jsonPathConfig).parse(sourceNode).read(jsonPath);
            if (result == null) {
                return objectMapper.getNodeFactory().nullNode();
            }
            if (result instanceof JsonNode) {
                return (JsonNode) result;
            }
            return objectMapper.valueToTree(result);
        } catch (Exception e) {
            log.debug("JSONPath evaluation failed for '{}': {}", jsonPath, e.getMessage());
            return objectMapper.getNodeFactory().nullNode();
        }
    }
}
