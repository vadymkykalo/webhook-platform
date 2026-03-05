package com.webhook.platform.api.service.workflow.executors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.webhook.platform.api.service.workflow.NodeExecutor;
import com.webhook.platform.api.service.workflow.StepResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Iterator;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Transform node — applies a JSON template to input data.
 * Supports {{field.path}} placeholders resolved from input.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class TransformNodeExecutor implements NodeExecutor {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{([^}]+)}}");

    private final ObjectMapper objectMapper;

    @Override
    public String getType() {
        return "transform";
    }

    @Override
    public StepResult execute(JsonNode nodeConfig, JsonNode input) {
        try {
            JsonNode templateNode = nodeConfig.get("template");
            if (templateNode == null || templateNode.isNull()) {
                return StepResult.success(input); // no template = pass through
            }

            String template = templateNode.isTextual() ? templateNode.textValue() : templateNode.toString();

            // If template is a JSON string, parse and resolve placeholders in values
            if (template.trim().startsWith("{")) {
                JsonNode templateJson = objectMapper.readTree(template);
                JsonNode resolved = resolvePlaceholders(templateJson, input);
                return StepResult.success(resolved);
            }

            // Plain string template — resolve and wrap
            String resolved = resolvePlaceholdersInString(template, input);
            return StepResult.success(objectMapper.createObjectNode().put("result", resolved));
        } catch (Exception e) {
            log.error("Transform node execution failed: {}", e.getMessage(), e);
            return StepResult.failed("Transform error: " + e.getMessage());
        }
    }

    private JsonNode resolvePlaceholders(JsonNode template, JsonNode input) {
        if (template.isObject()) {
            ObjectNode result = objectMapper.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> fields = template.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                result.set(field.getKey(), resolvePlaceholders(field.getValue(), input));
            }
            return result;
        }
        if (template.isTextual()) {
            String text = template.textValue();
            String resolved = resolvePlaceholdersInString(text, input);
            return objectMapper.getNodeFactory().textNode(resolved);
        }
        return template; // numbers, booleans, arrays — pass through
    }

    private String resolvePlaceholdersInString(String template, JsonNode input) {
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String path = matcher.group(1).trim();
            JsonNode value = resolvePath(path, input);
            String replacement = (value != null && !value.isMissingNode() && !value.isNull())
                    ? (value.isTextual() ? value.textValue() : value.toString())
                    : "";
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private JsonNode resolvePath(String path, JsonNode root) {
        String[] segments = path.split("\\.");
        JsonNode current = root;
        for (String segment : segments) {
            if (current == null || current.isMissingNode() || current.isNull()) return null;
            current = current.path(segment);
        }
        return current;
    }
}
