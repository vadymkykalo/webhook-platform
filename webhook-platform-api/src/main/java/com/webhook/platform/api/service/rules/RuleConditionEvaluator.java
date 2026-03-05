package com.webhook.platform.api.service.rules;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.webhook.platform.api.dto.RuleCondition;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Evaluates rule conditions against a parsed JSON event payload.
 * <p>
 * Designed for high-load: field values are resolved once and cached per event (memoization).
 * Operators are dispatched via switch — no reflection, no script engines.
 */
@Slf4j
public class RuleConditionEvaluator {

    private RuleConditionEvaluator() {
    }

    /**
     * Evaluate a list of conditions against the event root JSON node.
     *
     * @param conditions list of conditions to evaluate
     * @param operator   "AND" or "OR"
     * @param root       parsed event JSON
     * @param fieldCache mutable cache for resolved field values (shared per event for memoization)
     * @return true if conditions match
     */
    public static boolean evaluate(List<RuleCondition> conditions, String operator, JsonNode root, Map<String, JsonNode> fieldCache) {
        if (conditions == null || conditions.isEmpty()) {
            return true; // no conditions = always match
        }

        boolean isAnd = !"OR".equalsIgnoreCase(operator);

        for (RuleCondition condition : conditions) {
            boolean result = evaluateSingle(condition, root, fieldCache);
            if (isAnd && !result) {
                return false; // AND: short-circuit on first false
            }
            if (!isAnd && result) {
                return true; // OR: short-circuit on first true
            }
        }

        return isAnd; // AND: all passed → true; OR: none matched → false
    }

    /**
     * Evaluate a single condition.
     */
    static boolean evaluateSingle(RuleCondition condition, JsonNode root, Map<String, JsonNode> fieldCache) {
        if (condition == null || condition.getOperator() == null) {
            return false;
        }

        String field = condition.getField();
        String op = condition.getOperator().toLowerCase();
        Object value = condition.getValue();

        // exists/not_exists don't need a resolved value
        if ("exists".equals(op)) {
            return resolveField(field, root, fieldCache) != null && !resolveField(field, root, fieldCache).isMissingNode();
        }
        if ("not_exists".equals(op)) {
            JsonNode node = resolveField(field, root, fieldCache);
            return node == null || node.isMissingNode() || node.isNull();
        }

        JsonNode fieldNode = resolveField(field, root, fieldCache);
        if (fieldNode == null || fieldNode.isMissingNode() || fieldNode.isNull()) {
            return false; // field not present → all comparisons fail
        }

        return switch (op) {
            case "equals", "eq" -> compareEquals(fieldNode, value);
            case "not_equals", "neq", "ne" -> !compareEquals(fieldNode, value);
            case "gt" -> compareNumeric(fieldNode, value) > 0;
            case "gte", "ge" -> compareNumeric(fieldNode, value) >= 0;
            case "lt" -> compareNumeric(fieldNode, value) < 0;
            case "lte", "le" -> compareNumeric(fieldNode, value) <= 0;
            case "contains" -> asText(fieldNode).contains(String.valueOf(value));
            case "not_contains" -> !asText(fieldNode).contains(String.valueOf(value));
            case "starts_with" -> asText(fieldNode).startsWith(String.valueOf(value));
            case "ends_with" -> asText(fieldNode).endsWith(String.valueOf(value));
            case "in" -> evaluateIn(fieldNode, value);
            case "not_in" -> !evaluateIn(fieldNode, value);
            case "regex" -> evaluateRegex(fieldNode, value);
            default -> {
                log.warn("Unknown operator: {}", op);
                yield false;
            }
        };
    }

    // ─── Field resolution with memoization ─────────────────────────────

    static JsonNode resolveField(String path, JsonNode root, Map<String, JsonNode> cache) {
        if (path == null || root == null) {
            return null;
        }
        // Strip leading "$." if present
        String cleanPath = path.startsWith("$.") ? path.substring(2) : path;

        return cache.computeIfAbsent(cleanPath, p -> traversePath(p, root));
    }

    private static JsonNode traversePath(String path, JsonNode node) {
        String[] segments = path.split("\\.");
        JsonNode current = node;
        for (String segment : segments) {
            if (current == null || current.isMissingNode() || current.isNull()) {
                return null;
            }
            // Handle array index: items[0]
            int bracketIdx = segment.indexOf('[');
            if (bracketIdx >= 0 && segment.endsWith("]")) {
                String fieldName = segment.substring(0, bracketIdx);
                String indexStr = segment.substring(bracketIdx + 1, segment.length() - 1);
                current = current.path(fieldName);
                if (current.isArray()) {
                    try {
                        int index = Integer.parseInt(indexStr);
                        current = current.get(index);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                } else {
                    return null;
                }
            } else {
                current = current.path(segment);
            }
        }
        return current;
    }

    // ─── Comparison helpers ─────────────────────────────────────────────

    private static boolean compareEquals(JsonNode fieldNode, Object value) {
        if (value == null) {
            return fieldNode.isNull();
        }
        String fieldText = asText(fieldNode);
        String valueText = String.valueOf(value);

        // Try numeric comparison first
        if (fieldNode.isNumber() && isNumeric(valueText)) {
            return new BigDecimal(fieldText).compareTo(new BigDecimal(valueText)) == 0;
        }
        // Boolean comparison
        if (fieldNode.isBoolean()) {
            return fieldText.equals(valueText);
        }
        return fieldText.equals(valueText);
    }

    private static int compareNumeric(JsonNode fieldNode, Object value) {
        try {
            BigDecimal fieldNum = new BigDecimal(asText(fieldNode));
            BigDecimal valueNum = new BigDecimal(String.valueOf(value));
            return fieldNum.compareTo(valueNum);
        } catch (NumberFormatException e) {
            return 0; // non-numeric → fail safely
        }
    }

    @SuppressWarnings("unchecked")
    private static boolean evaluateIn(JsonNode fieldNode, Object value) {
        String fieldText = asText(fieldNode);
        if (value instanceof List<?> list) {
            return list.stream().anyMatch(v -> fieldText.equals(String.valueOf(v)));
        }
        // Single value fallback
        return fieldText.equals(String.valueOf(value));
    }

    private static boolean evaluateRegex(JsonNode fieldNode, Object value) {
        if (value == null) return false;
        try {
            Pattern pattern = Pattern.compile(String.valueOf(value));
            return pattern.matcher(asText(fieldNode)).find();
        } catch (PatternSyntaxException e) {
            log.warn("Invalid regex pattern: {}", value);
            return false;
        }
    }

    private static String asText(JsonNode node) {
        return node.isTextual() ? node.textValue() : node.toString();
    }

    private static boolean isNumeric(String s) {
        try {
            new BigDecimal(s);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * Create a fresh field cache for a single event evaluation.
     * Share this across all rules evaluated for the same event.
     */
    public static Map<String, JsonNode> newFieldCache() {
        return new HashMap<>(16);
    }
}
