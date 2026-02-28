package com.webhook.platform.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncomingForwardMessage {
    private UUID incomingEventId;
    private UUID destinationId;
    private UUID incomingSourceId;
    private Integer attemptCount;
    private boolean replay;
}
