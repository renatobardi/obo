class OboError(Exception):
    """Base exception class for Obo errors."""

    pass


class DatabaseOperationError(OboError):
    """Raised when a database operation fails."""

    pass


class UnsupportedTypeException(OboError):
    """Raised when an unsupported type is provided."""

    pass


class InvalidInputError(OboError):
    """Raised when invalid input is provided."""

    pass


class NotFoundError(OboError):
    """Raised when a requested resource is not found."""

    pass


class AuthenticationError(OboError):
    """Raised when there's an authentication problem."""

    pass


class ConfigurationError(OboError):
    """Raised when there's a configuration problem."""

    pass


class ExternalServiceError(OboError):
    """Raised when an external service (e.g., AI model) fails."""

    pass


class RateLimitError(OboError):
    """Raised when a rate limit is exceeded."""

    pass


class FileOperationError(OboError):
    """Raised when a file operation fails."""

    pass


class NetworkError(OboError):
    """Raised when a network operation fails."""

    pass


class NoTranscriptFound(OboError):
    """Raised when no transcript is found for a video."""

    pass
