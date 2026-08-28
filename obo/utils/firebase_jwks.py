"""Verify Firebase ID tokens via Google's public JWKS endpoint.

This mirrors the approach used by Kubo (KUBO-93 / ADR-0036 §II): instead of
relying on a service account and the Firebase Admin SDK, the backend verifies
the JWT signature and claims directly against Google's published keys. Only
RS256 is accepted, and the JWT is validated for issuer, audience, expiration,
subject and email verification.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import jwt
from jwt.api_jwk import PyJWKSet

from obo.exceptions import AuthenticationError

_GOOGLE_JWKS_URL = (
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
)
_DEFAULT_JWKS_TTL = 3600

_jwks_cache: tuple[PyJWKSet, float, int] | None = None


def clear_jwks_cache() -> None:
    """Clear the cached JWKS (useful for tests)."""
    global _jwks_cache  # noqa: PLW0603
    _jwks_cache = None


def _parse_max_age(cache_control: str | None) -> int:
    """Extract max-age from a Cache-Control header."""
    if not cache_control:
        return _DEFAULT_JWKS_TTL
    for directive in cache_control.split(","):
        part = directive.strip().lower()
        if part.startswith("max-age="):
            try:
                return max(0, int(part.split("=", 1)[1]))
            except ValueError:
                break
    return _DEFAULT_JWKS_TTL


def _fetch_jwks() -> PyJWKSet:
    """Fetch Google's public JWKS, caching it by the Cache-Control max-age."""
    global _jwks_cache  # noqa: PLW0603

    now = time.time()
    if _jwks_cache is not None:
        jwks, fetched_at, ttl = _jwks_cache
        if now - fetched_at < ttl:
            return jwks

    try:
        response = httpx.get(_GOOGLE_JWKS_URL, timeout=10)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise AuthenticationError(f"Google JWKS unavailable: {exc}") from exc

    ttl = _parse_max_age(response.headers.get("cache-control"))
    try:
        jwks = PyJWKSet.from_json(response.text)
    except jwt.PyJWTError as exc:
        raise AuthenticationError(f"Invalid Google JWKS: {exc}") from exc

    _jwks_cache = (jwks, now, ttl)
    return jwks


def _signing_key(jwks: PyJWKSet, kid: str) -> jwt.PyJWK:
    """Select the public key with the matching kid."""
    for key in jwks.keys:
        if key.key_id == kid:
            return key
    raise AuthenticationError(f"Unknown token kid: {kid}")


def verify_firebase_id_token(token: str, project_id: str) -> dict[str, Any]:
    """Verify a Firebase ID token and return uid/email.

    Raises ``AuthenticationError`` for any failure (malformed, wrong algorithm,
    unknown kid, invalid/expired signature, unverified email, etc.).
    """
    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError as exc:
        raise AuthenticationError(f"Malformed token: {exc}") from exc

    if header.get("alg") != "RS256":
        raise AuthenticationError("Token algorithm is not RS256")

    kid = header.get("kid")
    if not kid:
        raise AuthenticationError("Token header missing kid")

    jwks = _fetch_jwks()
    key = _signing_key(jwks, kid)

    try:
        payload = jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError(f"Invalid token: {exc}") from exc

    if not payload.get("sub"):
        raise AuthenticationError("Token subject is empty")
    if payload.get("email_verified") is not True:
        raise AuthenticationError("Email not verified")

    return {
        "uid": payload["sub"],
        "email": payload.get("email", ""),
    }
