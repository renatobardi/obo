"""Tests for obo.utils.firebase_jwks.verify_firebase_id_token.

These tests mock the network and cryptography layers so the unit exercises the
control flow (header parsing, key lookup, claim validation) without relying on
Google's live JWKS endpoint.
"""

from unittest.mock import Mock, patch

import jwt
import pytest

from obo.exceptions import AuthenticationError
from obo.utils.firebase_jwks import (
    _fetch_jwks,
    clear_jwks_cache,
    verify_firebase_id_token,
)


def _mock_jwks():
    """Return a patched PyJWKSet with a single key identified as 'key1'."""
    key = Mock()
    key.key_id = "key1"
    jwks = Mock()
    jwks.keys = [key]
    return jwks, key


@pytest.fixture(autouse=True)
def _reset_cache():
    clear_jwks_cache()
    yield
    clear_jwks_cache()


class TestVerifyFirebaseIdToken:
    def test_valid_token_returns_uid_and_email(self):
        jwks, signing_key = _mock_jwks()
        with (
            patch(
                "obo.utils.firebase_jwks.jwt.get_unverified_header",
                return_value={"alg": "RS256", "kid": "key1"},
            ),
            patch("obo.utils.firebase_jwks._fetch_jwks", return_value=jwks),
            patch(
                "obo.utils.firebase_jwks.jwt.decode",
                return_value={
                    "sub": "uid123",
                    "email": "test@example.com",
                    "email_verified": True,
                },
            ),
        ):
            result = verify_firebase_id_token("token", "test-project")

        assert result == {"uid": "uid123", "email": "test@example.com"}

    def test_missing_kid_raises_authentication_error(self):
        with patch(
            "obo.utils.firebase_jwks.jwt.get_unverified_header",
            return_value={"alg": "RS256"},
        ):
            with pytest.raises(AuthenticationError, match="missing kid"):
                verify_firebase_id_token("token", "test-project")

    def test_non_rs256_algorithm_raises_authentication_error(self):
        with patch(
            "obo.utils.firebase_jwks.jwt.get_unverified_header",
            return_value={"alg": "HS256", "kid": "key1"},
        ):
            with pytest.raises(AuthenticationError, match="not RS256"):
                verify_firebase_id_token("token", "test-project")

    def test_unverified_email_raises_authentication_error(self):
        jwks, _ = _mock_jwks()
        with (
            patch(
                "obo.utils.firebase_jwks.jwt.get_unverified_header",
                return_value={"alg": "RS256", "kid": "key1"},
            ),
            patch("obo.utils.firebase_jwks._fetch_jwks", return_value=jwks),
            patch(
                "obo.utils.firebase_jwks.jwt.decode",
                return_value={
                    "sub": "uid123",
                    "email": "test@example.com",
                    "email_verified": False,
                },
            ),
        ):
            with pytest.raises(AuthenticationError, match="not verified"):
                verify_firebase_id_token("token", "test-project")

    def test_invalid_token_raises_authentication_error(self):
        jwks, _ = _mock_jwks()
        with (
            patch(
                "obo.utils.firebase_jwks.jwt.get_unverified_header",
                return_value={"alg": "RS256", "kid": "key1"},
            ),
            patch("obo.utils.firebase_jwks._fetch_jwks", return_value=jwks),
            patch(
                "obo.utils.firebase_jwks.jwt.decode",
                side_effect=jwt.ExpiredSignatureError("expired"),
            ),
        ):
            with pytest.raises(AuthenticationError, match="expired"):
                verify_firebase_id_token("token", "test-project")


class TestFetchJwks:
    def test_fetch_caches_by_cache_control_max_age(self):
        response = Mock()
        response.headers = {"cache-control": "max-age=60"}
        response.text = '{"keys": []}'
        response.raise_for_status = Mock()

        with (
            patch("obo.utils.firebase_jwks.httpx.get", return_value=response),
            patch(
                "obo.utils.firebase_jwks.PyJWKSet.from_json",
                return_value=Mock(keys=[]),
            ),
        ):
            jwks1 = _fetch_jwks()
            jwks2 = _fetch_jwks()

        assert jwks1 is jwks2
        assert response.raise_for_status.call_count == 1
