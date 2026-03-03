package com.webhook.platform.api.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TransformPreviewRequest {

    @NotBlank
    private String inputPayload;

    private String transformExpression;

    private String customHeaders;
}
