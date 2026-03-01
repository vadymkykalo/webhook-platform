"""Error classes for Hookflow SDK."""

from typing import Dict, Optional
from .types import RateLimitInfo


class HookflowError(Exception):
    """Base exception for Hookflow SDK."""

    def __init__(
        self, message: str, status: int = 0, code: Optional[str] = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code

    def __str__(self) -> str:
        return f"{self.__class__.__name__}: {self.message} (status={self.status})"


class AuthenticationError(HookflowError):
    """Raised when API key is invalid or missing."""

    def __init__(self, message: str = "Invalid API key") -> None:
        super().__init__(message, status=401, code="authentication_error")


class RateLimitError(HookflowError):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str, rate_limit_info: RateLimitInfo) -> None:
        super().__init__(message, status=429, code="rate_limit_exceeded")
        self.rate_limit_info = rate_limit_info

    @property
    def retry_after_ms(self) -> int:
        """Milliseconds to wait before retrying."""
        import time
        now_ms = int(time.time() * 1000)
        return max(0, self.rate_limit_info.reset - now_ms)


class ValidationError(HookflowError):
    """Raised when request validation fails."""

    def __init__(
        self, message: str, field_errors: Optional[Dict[str, str]] = None
    ) -> None:
        super().__init__(message, status=400, code="validation_error")
        self.field_errors = field_errors or {}


class NotFoundError(HookflowError):
    """Raised when resource is not found."""

    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message, status=404, code="not_found")
