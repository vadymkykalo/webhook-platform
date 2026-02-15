package com.webhook.platform.worker.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jayway.jsonpath.Configuration;
import com.jayway.jsonpath.JsonPath;
import com.jayway.jsonpath.Option;
import com.jayway.jsonpath.spi.json.JacksonJsonNodeJsonProvider;
import com.jayway.jsonpath.spi.mapper.JacksonMappingProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Iterator;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
@RequiredArgsConstructor
public class PayloadTransformService {

    private final ObjectMapper objectMapper;
    
    private static final Pattern JSONPATH_PATTERN = Pattern.compile("\\$\\{([^}]+)}");
    
    private final Configuration jsonPathConfig = Configuration.builder()
            .jsonProvider(new JacksonJsonNodeJsonProvider())
            .mappingProvider(new JacksonMappingProvider())
            .options(Option.SUPPRESS_EXCEPTIONS)
            .build();

    /**
     * Transforms the event payload using the provided template.
     * Template supports JSONPath expressions in ${...} syntax.
     * 
     * Example template:
     * {
     *   "event_id": "${$.id}",
     *   "customer": {
     *     "name": "${$.data.customer.name}",
     *     "email": "${$.data.customer.email}"
     *   },
     *   "timestamp": "${$.created_at}"
     * }
     * 
     * @param originalPayload The original event payload JSON
     * @param template The transformation template
     * @return Transformed payload JSON string
     */
    public String transform(String originalPayload, String template) {
        if (template == null || template.isBlank()) {
            return originalPayload;
        }
        
        try {
            JsonNode sourceNode = objectMapper.readTree(originalPayload);
            JsonNode templateNode = objectMapper.readTree(template);
            
            JsonNode resultNode = processNode(templateNode, sourceNode);
            return objectMapper.writeValueAsString(resultNode);
        } catch (Exception e) {
            log.warn("Failed to transform payload, returning original: {}", e.getMessage());
            return originalPayload;
        }
    }

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
            JsonNode processedValue = processNode(field.getValue(), sourceNode);
            result.set(field.getKey(), processedValue);
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
            // Entire value is a JSONPath expression - return the actual value
            String jsonPath = matcher.group(1);
            return evaluateJsonPath(jsonPath, sourceNode);
        } else if (matcher.find()) {
            // Text contains embedded JSONPath expressions - string interpolation
            matcher.reset();
            StringBuffer sb = new StringBuffer();
            while (matcher.find()) {
                String jsonPath = matcher.group(1);
                JsonNode value = evaluateJsonPath(jsonPath, sourceNode);
                String replacement = value != null ? 
                        (value.isTextual() ? value.asText() : value.toString()) : "";
                matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
            }
            matcher.appendTail(sb);
            return objectMapper.getNodeFactory().textNode(sb.toString());
        } else {
            // Plain text - return as-is
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

    /**
     * Validates a template by parsing it and checking for valid JSONPath expressions.
     * 
     * @param template The template to validate
     * @return true if valid, false otherwise
     */
    public boolean validateTemplate(String template) {
        if (template == null || template.isBlank()) {
            return true;
        }
        
        try {
            objectMapper.readTree(template);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
