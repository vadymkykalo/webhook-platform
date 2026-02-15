"""Webhook signature verification utilities."""

import hashlib
import hmac
import time
from typing import Any, Dict, Optional

from .types import WebhookEvent
from .errors import WebhookPlatformError

DEFAULT_TOLERANCE_MS = 300000  # 5 minutes


def verify_signature(
    payload: str,
    signature: str,
    secret: str,
    tolerance_ms: int = DEFAULT_TOLERANCE_MS,
) -> bool:
    """
    Verify webhook signature using HMAC-SHA256.

    Args:
        payload: Raw request body as string
        signature: X-Signature header value (format: t=timestamp,v1=signature)
        secret: Endpoint webhook secret
        tolerance_ms: Maximum age of signature in milliseconds

    Returns:
        True if signature is valid

    Raises:
        WebhookPlatformError: If signature is invalid or expired
    """
    if not signature:
        raise WebhookPlatformError(
            "Missing signature header", 400, "invalid_signature"
        )

    # Parse signature
    timestamp: Optional[str] = None
    sig: Optional[str] = None

    for part in signature.split(","):
        if "=" in part:
            key, value = part.split("=", 1)
            if key == "t":
                timestamp = value
            elif key == "v1":
                sig = value

    if not timestamp or not sig:
        raise WebhookPlatformError(
            "Invalid signature format. Expected: t=timestamp,v1=signature",
            400,
            "invalid_signature",
        )

    # Check timestamp
    timestamp_ms = int(timestamp)
    now_ms = int(time.time() * 1000)

    if abs(now_ms - timestamp_ms) > tolerance_ms:
        raise WebhookPlatformError(
            "Webhook timestamp is outside tolerance window",
            400,
            "timestamp_expired",
        )

    # Verify signature
    signed_payload = f"{timestamp}.{payload}"
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(sig, expected_signature):
        raise WebhookPlatformError("Invalid signature", 400, "invalid_signature")

    return True


def construct_event(
    payload: str,
    headers: Dict[str, str],
    secret: str,
    tolerance_ms: int = DEFAULT_TOLERANCE_MS,
) -> WebhookEvent:
    """
    Construct a webhook event from request, verifying signature.

    Args:
        payload: Raw request body as string
        headers: Request headers (case-insensitive dict)
        secret: Endpoint webhook secret
        tolerance_ms: Maximum age of signature in milliseconds

    Returns:
        Parsed and verified WebhookEvent

    Raises:
        WebhookPlatformError: If signature is invalid or payload is malformed
    """
    # Get headers (case-insensitive)
    headers_lower = {k.lower(): v for k, v in headers.items()}

    signature = headers_lower.get("x-signature", "")
    timestamp = headers_lower.get("x-timestamp", "")
    event_id = headers_lower.get("x-event-id", "")
    delivery_id = headers_lower.get("x-delivery-id", "")

    if not signature:
        raise WebhookPlatformError(
            "Missing X-Signature header", 400, "missing_header"
        )

    verify_signature(payload, signature, secret, tolerance_ms)

    # Parse payload
    import json

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        raise WebhookPlatformError("Invalid JSON payload", 400, "invalid_payload")

    return WebhookEvent(
        event_id=event_id,
        delivery_id=delivery_id,
        timestamp=int(timestamp) if timestamp else int(time.time() * 1000),
        type=data.get("type", ""),
        data=data.get("data", data),
    )


def generate_signature(
    payload: str,
    secret: str,
    timestamp_ms: Optional[int] = None,
) -> str:
    """
    Generate a signature for testing purposes.

    Args:
        payload: Request body as string
        secret: Webhook secret
        timestamp_ms: Optional timestamp in milliseconds (defaults to now)

    Returns:
        Signature string in format t=timestamp,v1=signature
    """
    ts = timestamp_ms or int(time.time() * 1000)
    signed_payload = f"{ts}.{payload}"
    signature = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return f"t={ts},v1={signature}"
