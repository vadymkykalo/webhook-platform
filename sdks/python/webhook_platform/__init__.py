"""Official Python SDK for Webhook Platform."""

from .client import WebhookPlatform
from .errors import (
    WebhookPlatformError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    NotFoundError,
)
from .webhooks import verify_signature, construct_event, generate_signature
from .types import (
    Event,
    EventResponse,
    Endpoint,
    EndpointCreateParams,
    EndpointUpdateParams,
    Subscription,
    SubscriptionCreateParams,
    Delivery,
    DeliveryAttempt,
    DeliveryListParams,
    DeliveryStatus,
    PaginatedResponse,
    EndpointTestResult,
    RateLimitInfo,
    WebhookEvent,
)

__version__ = "1.1.0"
__all__ = [
    "WebhookPlatform",
    "WebhookPlatformError",
    "AuthenticationError",
    "RateLimitError",
    "ValidationError",
    "NotFoundError",
    "verify_signature",
    "construct_event",
    "generate_signature",
    "Event",
    "EventResponse",
    "Endpoint",
    "EndpointCreateParams",
    "EndpointUpdateParams",
    "Subscription",
    "SubscriptionCreateParams",
    "Delivery",
    "DeliveryAttempt",
    "DeliveryListParams",
    "DeliveryStatus",
    "PaginatedResponse",
    "EndpointTestResult",
    "RateLimitInfo",
    "WebhookEvent",
]
