package com.webhook.platform.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A single condition that evaluates a field in the event payload.
 * <p>
 * Supported operators:
 * <ul>
 *   <li>equals, not_equals — string/number equality</li>
 *   <li>gt, gte, lt, lte — numeric comparisons</li>
 *   <li>contains, not_contains — substring match</li>
 *   <li>starts_with, ends_with — prefix/suffix match</li>
 *   <li>in, not_in — value in array</li>
 *   <li>exists, not_exists — field presence check</li>
 *   <li>regex — regex match</li>
 * </ul>
 * <p>
 * Field uses dot-path notation: {@code data.amount}, {@code data.customer.email}, {@code type}
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RuleCondition {

    /** Dot-path to the field in the event JSON: "data.amount", "type", "data.items[0].price" */
    private String field;

    /** Comparison operator */
    private String operator;

    /** Value to compare against (String, Number, Boolean, or List for in/not_in) */
    private Object value;
}
