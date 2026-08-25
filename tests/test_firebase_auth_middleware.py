"""
Tests for api.auth.FirebaseAuthMiddleware (#27).

Built against a standalone FastAPI app (mirrors tests/test_max_body_size_middleware.py's
approach) rather than the real api.main.app, since which auth middleware is
registered there is decided once at import time from OBO_AUTH_MODE - a
dedicated app lets each test control Firebase verification directly via
mocking, independent of that import-time decision and other tests' state.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from obo.domain.tenancy import DEFAULT_TENANT_ID, DEFAULT_USER_ID
from obo.exceptions import NotFoundError


def _build_app(**middleware_kwargs):
    from api.auth import COMPLETE_SIGNUP_PATH, FirebaseAuthMiddleware

    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/protected")
    async def protected(request: Request):
        from obo.domain.tenancy import get_current_tenant, get_current_user

        return {
            "tenant": get_current_tenant(),
            "user": get_current_user(),
            "firebase_uid": getattr(request.state, "firebase_uid", None),
        }

    @app.post(COMPLETE_SIGNUP_PATH)
    async def complete_signup(request: Request):
        return {"firebase_uid": getattr(request.state, "firebase_uid", None)}

    app.add_middleware(FirebaseAuthMiddleware, **middleware_kwargs)
    return app


@pytest.fixture
def client():
    # FastAPI/Starlette build the middleware stack (and so call
    # FirebaseAuthMiddleware.__init__ -> init_firebase_app()) lazily on the
    # first request, not at add_middleware() time - so this patch must still
    # be active when the test issues its request, not just during app setup.
    with patch("api.auth.init_firebase_app"):
        yield TestClient(_build_app())


class TestMissingOrMalformedHeader:
    def test_missing_authorization_header_returns_401(self, client):
        response = client.get("/protected")
        assert response.status_code == 401

    def test_non_bearer_scheme_returns_401(self, client):
        response = client.get(
            "/protected", headers={"Authorization": "Basic abc123"}
        )
        assert response.status_code == 401

    def test_excluded_path_bypasses_auth(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_options_preflight_bypasses_auth(self, client):
        response = client.options("/protected")
        assert response.status_code != 401


class TestTokenVerification:
    def test_invalid_token_returns_401(self, client):
        with patch(
            "api.auth.firebase_auth.verify_id_token",
            side_effect=ValueError("invalid token"),
        ):
            response = client.get(
                "/protected", headers={"Authorization": "Bearer bad-token"}
            )
        assert response.status_code == 401

    def test_valid_token_calls_verify_id_token_with_check_revoked_false(self, client):
        with (
            patch(
                "api.auth.firebase_auth.verify_id_token",
                return_value={"uid": "uid123"},
            ) as mock_verify,
            patch(
                "api.auth.User.get",
                new=AsyncMock(
                    side_effect=lambda id: _fake_user("uid123", "tenant:acme")
                ),
            ),
        ):
            client.get("/protected", headers={"Authorization": "Bearer good-token"})
        mock_verify.assert_called_once()
        assert mock_verify.call_args.args[0] == "good-token"
        assert mock_verify.call_args.kwargs.get("check_revoked") is False


class TestUnprovisionedIdentity:
    def test_valid_token_no_matching_user_returns_403_on_protected_route(self, client):
        with (
            patch(
                "api.auth.firebase_auth.verify_id_token",
                return_value={"uid": "new-uid"},
            ),
            patch("api.auth.User.get", new=AsyncMock(side_effect=NotFoundError("no"))),
        ):
            response = client.get(
                "/protected", headers={"Authorization": "Bearer good-token"}
            )
        assert response.status_code == 403

    def test_valid_token_no_matching_user_passes_through_on_complete_signup(
        self, client
    ):
        with patch(
            "api.auth.firebase_auth.verify_id_token",
            return_value={"uid": "new-uid", "email": "new@example.com"},
        ):
            response = client.post(
                "/api/auth/complete-signup",
                headers={"Authorization": "Bearer good-token"},
            )
        assert response.status_code == 200
        assert response.json()["firebase_uid"] == "new-uid"


class TestTenancyContextPropagation:
    def test_provisioned_user_sets_tenancy_context_for_the_request(self, client):
        with (
            patch(
                "api.auth.firebase_auth.verify_id_token",
                return_value={"uid": "uid123"},
            ),
            patch(
                "api.auth.User.get",
                new=AsyncMock(
                    side_effect=lambda id: _fake_user("uid123", "tenant:acme")
                ),
            ),
        ):
            response = client.get(
                "/protected", headers={"Authorization": "Bearer good-token"}
            )
        assert response.status_code == 200
        body = response.json()
        assert body["tenant"] == "tenant:acme"
        assert body["user"] == "user:uid123"
        assert body["firebase_uid"] == "uid123"

    def test_context_resets_to_sentinel_after_request(self, client):
        with (
            patch(
                "api.auth.firebase_auth.verify_id_token",
                return_value={"uid": "uid123"},
            ),
            patch(
                "api.auth.User.get",
                new=AsyncMock(
                    side_effect=lambda id: _fake_user("uid123", "tenant:acme")
                ),
            ),
        ):
            client.get("/protected", headers={"Authorization": "Bearer good-token"})

        from obo.domain.tenancy import get_current_tenant, get_current_user

        assert get_current_tenant() == DEFAULT_TENANT_ID
        assert get_current_user() == DEFAULT_USER_ID


def _fake_user(uid: str, tenant_id: str):
    from obo.domain.tenant import User

    return User(id=f"user:{uid}", tenant=tenant_id)
