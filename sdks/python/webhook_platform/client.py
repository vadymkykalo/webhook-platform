"""Webhook Platform API client."""

from typing import Any, Dict, List, Optional
import requests

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
    PaginatedResponse,
    EndpointTestResult,
    RateLimitInfo,
)
from .errors import (
    WebhookPlatformError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    NotFoundError,
)

DEFAULT_BASE_URL = "http://localhost:8080"
DEFAULT_TIMEOUT = 30
SDK_VERSION = "1.0.0"


class WebhookPlatform:
    """Webhook Platform API client."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> None:
        if not api_key:
            raise ValueError("API key is required")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        self.events = Events(self)
        self.endpoints = Endpoints(self)
        self.subscriptions = Subscriptions(self)
        self.deliveries = Deliveries(self)

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"

        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"webhook-platform-python/{SDK_VERSION}",
        }

        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        try:
            response = requests.request(
                method=method,
                url=url,
                json=body,
                params=params,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.Timeout:
            raise WebhookPlatformError("Request timeout", 0, "timeout")
        except requests.RequestException as e:
            raise WebhookPlatformError(str(e), 0, "network_error")

        rate_limit_info = self._extract_rate_limit_info(response.headers)

        if response.status_code == 204:
            return None

        try:
            data = response.json() if response.text else {}
        except ValueError:
            data = {}

        if response.status_code >= 400:
            raise self._handle_error(response.status_code, data, rate_limit_info)

        return data

    def _extract_rate_limit_info(
        self, headers: requests.structures.CaseInsensitiveDict
    ) -> Optional[RateLimitInfo]:
        limit = headers.get("X-RateLimit-Limit")
        remaining = headers.get("X-RateLimit-Remaining")
        reset = headers.get("X-RateLimit-Reset")

        if limit and remaining and reset:
            return RateLimitInfo(
                limit=int(limit),
                remaining=int(remaining),
                reset=int(reset),
            )
        return None

    def _handle_error(
        self,
        status: int,
        body: Dict[str, Any],
        rate_limit_info: Optional[RateLimitInfo],
    ) -> WebhookPlatformError:
        message = body.get("message", "Unknown error")

        if status == 401:
            return AuthenticationError(message)
        elif status == 404:
            return NotFoundError(message)
        elif status == 429:
            import time
            info = rate_limit_info or RateLimitInfo(
                limit=0, remaining=0, reset=int(time.time() * 1000) + 60000
            )
            return RateLimitError(message, info)
        elif status == 400:
            return ValidationError(message, body.get("fieldErrors", {}))
        else:
            return WebhookPlatformError(message, status, body.get("error"))


class Events:
    """Events API."""

    def __init__(self, client: WebhookPlatform) -> None:
        self._client = client

    def send(
        self, event: Event, idempotency_key: Optional[str] = None
    ) -> EventResponse:
        """Send an event to be delivered to subscribed endpoints."""
        data = self._client._request(
            "POST",
            "/api/v1/events",
            body={"type": event.type, "data": event.data},
            idempotency_key=idempotency_key,
        )
        return EventResponse.from_dict(data)


class Endpoints:
    """Endpoints API."""

    def __init__(self, client: WebhookPlatform) -> None:
        self._client = client

    def create(self, project_id: str, params: EndpointCreateParams) -> Endpoint:
        """Create a new endpoint."""
        data = self._client._request(
            "POST",
            f"/api/v1/projects/{project_id}/endpoints",
            body=params.to_dict(),
        )
        return Endpoint.from_dict(data)

    def get(self, project_id: str, endpoint_id: str) -> Endpoint:
        """Get endpoint by ID."""
        data = self._client._request(
            "GET",
            f"/api/v1/projects/{project_id}/endpoints/{endpoint_id}",
        )
        return Endpoint.from_dict(data)

    def list(self, project_id: str) -> List[Endpoint]:
        """List all endpoints for a project."""
        data = self._client._request(
            "GET",
            f"/api/v1/projects/{project_id}/endpoints",
        )
        return [Endpoint.from_dict(e) for e in data]

    def update(
        self, project_id: str, endpoint_id: str, params: EndpointUpdateParams
    ) -> Endpoint:
        """Update endpoint."""
        data = self._client._request(
            "PUT",
            f"/api/v1/projects/{project_id}/endpoints/{endpoint_id}",
            body=params.to_dict(),
        )
        return Endpoint.from_dict(data)

    def delete(self, project_id: str, endpoint_id: str) -> None:
        """Delete endpoint."""
        self._client._request(
            "DELETE",
            f"/api/v1/projects/{project_id}/endpoints/{endpoint_id}",
        )

    def rotate_secret(self, project_id: str, endpoint_id: str) -> Endpoint:
        """Rotate endpoint webhook secret."""
        data = self._client._request(
            "POST",
            f"/api/v1/projects/{project_id}/endpoints/{endpoint_id}/rotate-secret",
        )
        return Endpoint.from_dict(data)

    def test(self, project_id: str, endpoint_id: str) -> EndpointTestResult:
        """Test endpoint connectivity."""
        data = self._client._request(
            "POST",
            f"/api/v1/projects/{project_id}/endpoints/{endpoint_id}/test",
        )
        return EndpointTestResult.from_dict(data)


class Subscriptions:
    """Subscriptions API."""

    def __init__(self, client: WebhookPlatform) -> None:
        self._client = client

    def create(
        self, project_id: str, params: SubscriptionCreateParams
    ) -> Subscription:
        """Create a new subscription."""
        data = self._client._request(
            "POST",
            f"/api/v1/projects/{project_id}/subscriptions",
            body=params.to_dict(),
        )
        return Subscription.from_dict(data)

    def get(self, project_id: str, subscription_id: str) -> Subscription:
        """Get subscription by ID."""
        data = self._client._request(
            "GET",
            f"/api/v1/projects/{project_id}/subscriptions/{subscription_id}",
        )
        return Subscription.from_dict(data)

    def list(self, project_id: str) -> List[Subscription]:
        """List all subscriptions for a project."""
        data = self._client._request(
            "GET",
            f"/api/v1/projects/{project_id}/subscriptions",
        )
        return [Subscription.from_dict(s) for s in data]

    def update(
        self,
        project_id: str,
        subscription_id: str,
        event_types: Optional[List[str]] = None,
        enabled: Optional[bool] = None,
    ) -> Subscription:
        """Update subscription."""
        body: Dict[str, Any] = {}
        if event_types is not None:
            body["eventTypes"] = event_types
        if enabled is not None:
            body["enabled"] = enabled

        data = self._client._request(
            "PUT",
            f"/api/v1/projects/{project_id}/subscriptions/{subscription_id}",
            body=body,
        )
        return Subscription.from_dict(data)

    def delete(self, project_id: str, subscription_id: str) -> None:
        """Delete subscription."""
        self._client._request(
            "DELETE",
            f"/api/v1/projects/{project_id}/subscriptions/{subscription_id}",
        )


class Deliveries:
    """Deliveries API."""

    def __init__(self, client: WebhookPlatform) -> None:
        self._client = client

    def get(self, delivery_id: str) -> Delivery:
        """Get delivery by ID."""
        data = self._client._request("GET", f"/api/v1/deliveries/{delivery_id}")
        return Delivery.from_dict(data)

    def list(
        self, project_id: str, params: Optional[DeliveryListParams] = None
    ) -> PaginatedResponse:
        """List deliveries for a project with optional filters."""
        query_params = (params or DeliveryListParams()).to_params()
        data = self._client._request(
            "GET",
            f"/api/v1/deliveries/projects/{project_id}",
            params=query_params,
        )
        return PaginatedResponse.from_dict(data)

    def get_attempts(self, delivery_id: str) -> List[DeliveryAttempt]:
        """Get all delivery attempts."""
        data = self._client._request(
            "GET",
            f"/api/v1/deliveries/{delivery_id}/attempts",
        )
        return [DeliveryAttempt.from_dict(a) for a in data]

    def replay(self, delivery_id: str) -> None:
        """Replay a failed delivery."""
        self._client._request("POST", f"/api/v1/deliveries/{delivery_id}/replay")
