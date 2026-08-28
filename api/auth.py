import asyncio
import os
import secrets
from typing import Any, Literal, Optional, cast

from fastapi import Request
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from obo.domain.tenancy import current_tenant, current_user
from obo.domain.tenant import User
from obo.exceptions import ConfigurationError, NotFoundError
from obo.utils.encryption import get_secret_from_env
from obo.utils.firebase_jwks import verify_firebase_id_token

# Single source of truth for the signup-provisioning route, shared with
# api/routers/auth.py (the route definition) so the two can't drift apart.
COMPLETE_SIGNUP_PATH = "/api/auth/complete-signup"


AuthMode = Literal["password", "firebase"]


def get_auth_mode() -> AuthMode:
    """Return the configured auth mode: "password" (default) or "firebase".

    Exactly one mode is active per instance - an unrecognized value fails
    fast rather than silently falling back, since a typo here would
    otherwise silently disable auth for one mode without any signal.
    """
    mode = os.environ.get("OBO_AUTH_MODE", "password").strip().lower()
    if mode not in ("password", "firebase"):
        raise ConfigurationError(
            f"Invalid OBO_AUTH_MODE '{mode}': must be 'password' or 'firebase'"
        )
    return cast(AuthMode, mode)


def get_firebase_project_id() -> str:
    """Return the Firebase project id required for JWKS token verification."""
    project_id = get_secret_from_env("OBO_FIREBASE_PROJECT_ID")
    if not project_id:
        raise ConfigurationError(
            "OBO_AUTH_MODE=firebase requires OBO_FIREBASE_PROJECT_ID to be set."
        )
    return project_id


class PasswordAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to check password authentication for all API requests.
    Auth is fully disabled (no hardcoded default password) if
    OBO_PASSWORD is not set.
    Supports Docker secrets via OBO_PASSWORD_FILE.
    """

    def __init__(
        self,
        app: ASGIApp,
        excluded_paths: Optional[list[str]] = None,
        excluded_prefixes: Optional[list[str]] = None,
    ) -> None:
        super().__init__(app)
        self.password = get_secret_from_env("OBO_PASSWORD")
        self.excluded_paths: list[str] = excluded_paths or [
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]
        self.excluded_prefixes: list[str] = excluded_prefixes or [
            "/api/invites/preview/"
        ]

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip authentication if no password is set
        if not self.password:
            return await call_next(request)

        # Skip authentication for excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Skip authentication for excluded path prefixes
        if any(
            request.url.path.startswith(prefix)
            for prefix in self.excluded_prefixes
        ):
            return await call_next(request)

        # Skip authentication for CORS preflight requests (OPTIONS)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check authorization header
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Expected format: "Bearer {password}"
        try:
            scheme, credentials = auth_header.split(" ", 1)
            if scheme.lower() != "bearer":
                raise ValueError("Invalid authentication scheme")
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authorization header format"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Check password (constant-time to avoid a timing side-channel)
        if not secrets.compare_digest(
            credentials.encode("utf-8"), self.password.encode("utf-8")
        ):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid password"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Password is correct, proceed with the request
        response = await call_next(request)
        return response


class FirebaseAuthMiddleware(BaseHTTPMiddleware):
    """
    Verifies `Authorization: Bearer <Firebase ID token>` on every request,
    active only when OBO_AUTH_MODE=firebase. On success, resolves the
    matching `user:<uid>` row and sets the tenancy contextvars
    (obo.domain.tenancy) for the duration of the request, so every domain
    read/write during this request is scoped to that user's tenant/owner.

    A verified identity with no matching `user:` row is let through only for
    `complete_signup_path` (first-time signup provisions the row there);
    every other endpoint returns 403 until signup completes.
    """

    def __init__(
        self,
        app: ASGIApp,
        excluded_paths: Optional[list[str]] = None,
        excluded_prefixes: Optional[list[str]] = None,
        complete_signup_path: str = COMPLETE_SIGNUP_PATH,
    ) -> None:
        super().__init__(app)
        self.project_id = get_firebase_project_id()
        self.excluded_paths: list[str] = excluded_paths or [
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/api/auth/status",
        ]
        self.excluded_prefixes: list[str] = excluded_prefixes or [
            "/api/invites/preview/"
        ]
        self.complete_signup_path = complete_signup_path

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if (
            request.url.path in self.excluded_paths
            or request.method == "OPTIONS"
            or any(
                request.url.path.startswith(prefix)
                for prefix in self.excluded_prefixes
            )
        ):
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            scheme, token = auth_header.split(" ", 1)
            if scheme.lower() != "bearer":
                raise ValueError("Invalid authentication scheme")
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authorization header format"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            # Token verification is sync (blocking network I/O on JWKS cache
            # miss); asyncio.to_thread() keeps it off the event loop.
            decoded: dict[str, Any] = await asyncio.to_thread(
                verify_firebase_id_token, token, self.project_id
            )
        except Exception as e:
            logger.debug(f"Firebase ID token verification failed: {e}")
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired token"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        uid = decoded["uid"]
        request.state.firebase_uid = uid
        request.state.firebase_email = decoded.get("email")

        if request.url.path == self.complete_signup_path:
            return await call_next(request)

        try:
            user = await User.get(f"user:{uid}")
        except NotFoundError:
            return JSONResponse(
                status_code=403,
                content={"detail": "Account not provisioned. Complete signup first."},
            )

        tenant_id, user_id = user.tenant, user.id
        if not tenant_id or not user_id:
            logger.error(f"Malformed user row for uid={uid}: missing tenant/id")
            return JSONResponse(
                status_code=500, content={"detail": "Account data is corrupted"}
            )

        tenant_token = current_tenant.set(tenant_id)
        user_token = current_user.set(user_id)
        try:
            return await call_next(request)
        finally:
            current_tenant.reset(tenant_token)
            current_user.reset(user_token)
