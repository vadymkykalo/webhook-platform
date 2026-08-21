package com.webhook.platform.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * A *configured* payload transformation that fails to apply must never fall back to
 * shipping the raw payload — customers use transformations to strip PII before a payload
 * leaves the platform, so a broken template must fail loudly (retryable), not silently.
 *
 * "No transformation configured" (null/blank template) is a distinct, non-error case and
 * must keep returning the original payload unchanged.
 */
class PayloadTransformServiceTest {

    private SimpleMeterRegistry meterRegistry;
    private PayloadTransformService service;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        service = new PayloadTransformService(new ObjectMapper(), meterRegistry);
    }

    @Test
    void transform_noTemplateConfigured_returnsOriginalPayload_nullTemplate() {
        String original = "{\"id\":\"evt_1\",\"pii\":\"ssn-123-45-6789\"}";

        String result = service.transform(original, null);

        assertEquals(original, result, "no transformation configured must send the payload as-is");
    }

    @Test
    void transform_noTemplateConfigured_returnsOriginalPayload_blankTemplate() {
        String original = "{\"id\":\"evt_1\",\"pii\":\"ssn-123-45-6789\"}";

        String result = service.transform(original, "   ");

        assertEquals(original, result, "a blank template means no transformation configured");
    }

    @Test
    void transform_validTemplate_appliesJsonPathSubstitution() {
        String original = "{\"id\":\"evt_1\",\"pii\":\"secret\",\"data\":{\"customer\":{\"name\":\"Ada\"}}}";
        String template = "{\"event_id\":\"${$.id}\",\"customer_name\":\"${$.data.customer.name}\"}";

        String result = service.transform(original, template);

        assertEquals("{\"event_id\":\"evt_1\",\"customer_name\":\"Ada\"}", result);
    }

    /**
     * Reproduces the original bug: a broken (non-JSON) template used to be swallowed
     * and the raw, untransformed payload — including the PII the transform exists to strip —
     * was returned instead. On fixed code this must throw rather than leaking the payload.
     */
    @Test
    void transform_brokenTemplateSyntax_throwsInsteadOfLeakingRawPayload() {
        String original = "{\"id\":\"evt_1\",\"pii\":\"ssn-123-45-6789\"}";
        String brokenTemplate = "{ this is not valid json ";

        PayloadTransformException ex = assertThrows(PayloadTransformException.class,
                () -> service.transform(original, brokenTemplate));

        assertEquals(1, meterRegistry.get("transform_failed_total").counter().count(),
                "a configured-but-failing transform must be counted, not just warn-logged");
        org.junit.jupiter.api.Assertions.assertNotNull(ex.getMessage());
    }

    @Test
    void transform_sourcePayloadIsInvalidJson_throwsInsteadOfLeakingRawPayload() {
        String invalidSourcePayload = "not-json-at-all";
        String template = "{\"event_id\":\"${$.id}\"}";

        assertThrows(PayloadTransformException.class,
                () -> service.transform(invalidSourcePayload, template));

        assertEquals(1, meterRegistry.get("transform_failed_total").counter().count());
    }

    @Test
    void transform_doesNotIncrementFailureCounter_whenNoTemplateConfigured() {
        service.transform("{\"id\":1}", null);

        assertEquals(0.0, meterRegistry.get("transform_failed_total").counter().count(),
                "no transformation configured is not a failure and must not be counted");
    }
}
