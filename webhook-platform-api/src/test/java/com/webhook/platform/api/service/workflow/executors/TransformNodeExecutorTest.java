package com.webhook.platform.api.service.workflow.executors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.WorkflowStepExecution.StepStatus;
import com.webhook.platform.api.service.workflow.StepResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TransformNodeExecutorTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private TransformNodeExecutor executor;

    @BeforeEach
    void setUp() {
        executor = new TransformNodeExecutor(mapper);
    }

    private JsonNode json(String raw) throws Exception {
        return mapper.readTree(raw);
    }

    @Test
    void getType_returnsTransform() {
        assertThat(executor.getType()).isEqualTo("transform");
    }

    @Test
    void noTemplate_passesThroughInput() throws Exception {
        JsonNode input = json("{\"a\":1}");
        StepResult result = executor.execute(json("{}"), input);

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(result.output()).isEqualTo(input);
    }

    @Test
    void jsonTemplate_resolvesPlaceholdersFromInput() throws Exception {
        JsonNode config = json("""
                {
                  "template": "{\\"orderId\\": \\"{{data.id}}\\", \\"customer\\": \\"{{data.customer.name}}\\", \\"fixed\\": 42}"
                }
                """);
        JsonNode input = json("{\"data\":{\"id\":\"o-1\",\"customer\":{\"name\":\"Ada\"}}}");

        StepResult result = executor.execute(config, input);

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(result.output().get("orderId").asText()).isEqualTo("o-1");
        assertThat(result.output().get("customer").asText()).isEqualTo("Ada");
        assertThat(result.output().get("fixed").asInt()).isEqualTo(42);
    }

    @Test
    void jsonTemplateAsObjectNode_resolvesPlaceholders() throws Exception {
        JsonNode template = json("{\"id\": \"{{orderId}}\"}");
        var config = mapper.createObjectNode();
        config.set("template", template);
        JsonNode input = json("{\"orderId\":\"abc-123\"}");

        StepResult result = executor.execute(config, input);

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(result.output().get("id").asText()).isEqualTo("abc-123");
    }

    @Test
    void plainStringTemplate_wrapsResolvedValueInResultField() throws Exception {
        JsonNode config = json("{\"template\":\"Order {{orderId}} received\"}");
        JsonNode input = json("{\"orderId\":\"o-9\"}");

        StepResult result = executor.execute(config, input);

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(result.output().get("result").asText()).isEqualTo("Order o-9 received");
    }

    @Test
    void missingPlaceholderPath_resolvesToEmptyString() throws Exception {
        JsonNode config = json("{\"template\":\"value={{missing.path}}\"}");
        JsonNode input = json("{}");

        StepResult result = executor.execute(config, input);

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(result.output().get("result").asText()).isEqualTo("value=");
    }

    @Test
    void nestedObjectTemplate_resolvesNestedFields() throws Exception {
        JsonNode config = json("""
                {"template": "{\\"a\\": {\\"b\\": \\"{{x}}\\"}}"}
                """);
        JsonNode input = json("{\"x\":\"nested-value\"}");

        StepResult result = executor.execute(config, input);

        assertThat(result.status()).isEqualTo(StepStatus.SUCCESS);
        assertThat(result.output().get("a").get("b").asText()).isEqualTo("nested-value");
    }

    @Test
    void malformedJsonTemplate_returnsFailed() throws Exception {
        JsonNode config = json("{\"template\":\"{not valid json\"}");

        StepResult result = executor.execute(config, json("{}"));

        // "{not valid json" starts with "{" so it's parsed as JSON and should fail to parse
        assertThat(result.status()).isEqualTo(StepStatus.FAILED);
        assertThat(result.errorMessage()).contains("Transform error");
    }
}
