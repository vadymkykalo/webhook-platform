"""Type definitions for Webhook Platform SDK."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from enum import Enum


class DeliveryStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    DLQ = "DLQ"


@dataclass
class Event:
    type: str
    data: Dict[str, Any]


@dataclass
class EventResponse:
    event_id: str
    type: str
    created_at: str
    deliveries_created: int

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EventResponse":
        return cls(
            event_id=data["eventId"],
            type=data["type"],
            created_at=data["createdAt"],
            deliveries_created=data["deliveriesCreated"],
        )


@dataclass
class Endpoint:
    id: str
    url: str
    secret: str
    enabled: bool
    created_at: str
    description: Optional[str] = None
    rate_limit_per_second: Optional[int] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Endpoint":
        return cls(
            id=data["id"],
            url=data["url"],
            secret=data.get("secret", ""),
            enabled=data["enabled"],
            created_at=data["createdAt"],
            description=data.get("description"),
            rate_limit_per_second=data.get("rateLimitPerSecond"),
        )


@dataclass
class EndpointCreateParams:
    url: str
    description: Optional[str] = None
    enabled: bool = True
    rate_limit_per_second: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"url": self.url, "enabled": self.enabled}
        if self.description:
            result["description"] = self.description
        if self.rate_limit_per_second:
            result["rateLimitPerSecond"] = self.rate_limit_per_second
        return result


@dataclass
class EndpointUpdateParams:
    url: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    rate_limit_per_second: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        if self.url is not None:
            result["url"] = self.url
        if self.description is not None:
            result["description"] = self.description
        if self.enabled is not None:
            result["enabled"] = self.enabled
        if self.rate_limit_per_second is not None:
            result["rateLimitPerSecond"] = self.rate_limit_per_second
        return result


@dataclass
class Subscription:
    id: str
    endpoint_id: str
    event_type: str
    enabled: bool
    created_at: str
    project_id: Optional[str] = None
    ordering_enabled: bool = False
    max_attempts: int = 7
    timeout_seconds: int = 30
    retry_delays: Optional[str] = None
    payload_template: Optional[str] = None
    custom_headers: Optional[str] = None
    updated_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Subscription":
        return cls(
            id=data["id"],
            endpoint_id=data["endpointId"],
            event_type=data["eventType"],
            enabled=data["enabled"],
            created_at=data["createdAt"],
            project_id=data.get("projectId"),
            ordering_enabled=data.get("orderingEnabled", False),
            max_attempts=data.get("maxAttempts", 7),
            timeout_seconds=data.get("timeoutSeconds", 30),
            retry_delays=data.get("retryDelays"),
            payload_template=data.get("payloadTemplate"),
            custom_headers=data.get("customHeaders"),
            updated_at=data.get("updatedAt"),
        )


@dataclass
class SubscriptionCreateParams:
    endpoint_id: str
    event_type: str
    enabled: bool = True
    ordering_enabled: Optional[bool] = None
    max_attempts: Optional[int] = None
    timeout_seconds: Optional[int] = None
    retry_delays: Optional[str] = None
    payload_template: Optional[str] = None
    custom_headers: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "endpointId": self.endpoint_id,
            "eventType": self.event_type,
            "enabled": self.enabled,
        }
        if self.ordering_enabled is not None:
            result["orderingEnabled"] = self.ordering_enabled
        if self.max_attempts is not None:
            result["maxAttempts"] = self.max_attempts
        if self.timeout_seconds is not None:
            result["timeoutSeconds"] = self.timeout_seconds
        if self.retry_delays is not None:
            result["retryDelays"] = self.retry_delays
        if self.payload_template is not None:
            result["payloadTemplate"] = self.payload_template
        if self.custom_headers is not None:
            result["customHeaders"] = self.custom_headers
        return result


@dataclass
class Delivery:
    id: str
    event_id: str
    endpoint_id: str
    status: DeliveryStatus
    attempt_count: int
    max_attempts: int
    created_at: str
    next_attempt_at: Optional[str] = None
    succeeded_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Delivery":
        return cls(
            id=data["id"],
            event_id=data["eventId"],
            endpoint_id=data["endpointId"],
            status=DeliveryStatus(data["status"]),
            attempt_count=data["attemptCount"],
            max_attempts=data["maxAttempts"],
            created_at=data["createdAt"],
            next_attempt_at=data.get("nextAttemptAt"),
            succeeded_at=data.get("succeededAt"),
        )


@dataclass
class DeliveryAttempt:
    id: str
    attempt_number: int
    latency_ms: int
    attempted_at: str
    http_status: Optional[int] = None
    response_body: Optional[str] = None
    error_message: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeliveryAttempt":
        return cls(
            id=data["id"],
            attempt_number=data["attemptNumber"],
            latency_ms=data["latencyMs"],
            attempted_at=data["attemptedAt"],
            http_status=data.get("httpStatus"),
            response_body=data.get("responseBody"),
            error_message=data.get("errorMessage"),
        )


@dataclass
class DeliveryListParams:
    status: Optional[DeliveryStatus] = None
    endpoint_id: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    page: int = 0
    size: int = 20

    def to_params(self) -> Dict[str, Any]:
        params: Dict[str, Any] = {"page": self.page, "size": self.size}
        if self.status:
            params["status"] = self.status.value
        if self.endpoint_id:
            params["endpointId"] = self.endpoint_id
        if self.from_date:
            params["fromDate"] = self.from_date
        if self.to_date:
            params["toDate"] = self.to_date
        return params


@dataclass
class PaginatedResponse:
    content: List[Delivery]
    total_elements: int
    total_pages: int
    size: int
    number: int

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PaginatedResponse":
        return cls(
            content=[Delivery.from_dict(d) for d in data["content"]],
            total_elements=data["totalElements"],
            total_pages=data["totalPages"],
            size=data["size"],
            number=data["number"],
        )


@dataclass
class EndpointTestResult:
    success: bool
    latency_ms: int
    http_status: Optional[int] = None
    error_message: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EndpointTestResult":
        return cls(
            success=data["success"],
            latency_ms=data["latencyMs"],
            http_status=data.get("httpStatus"),
            error_message=data.get("errorMessage"),
        )


@dataclass
class RateLimitInfo:
    limit: int
    remaining: int
    reset: int


@dataclass
class WebhookEvent:
    event_id: str
    delivery_id: str
    timestamp: int
    type: str
    data: Dict[str, Any]
