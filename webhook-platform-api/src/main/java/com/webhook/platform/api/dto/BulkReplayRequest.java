package com.webhook.platform.api.dto;

import com.webhook.platform.api.domain.enums.DeliveryStatus;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BulkReplayRequest {
    private List<UUID> deliveryIds;
    private DeliveryStatus status;
    private UUID endpointId;
    private UUID projectId;
}
