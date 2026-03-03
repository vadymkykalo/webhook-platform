package com.webhook.platform.api.dto;

import com.webhook.platform.api.domain.enums.AlertSeverity;
import com.webhook.platform.api.domain.enums.IncidentStatus;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncidentRequest {

    @NotBlank
    private String title;

    private AlertSeverity severity;

    private IncidentStatus status;

    private String rcaNotes;
}
