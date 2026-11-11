"""Signin level (root vs database) for obo and surreal-commands."""

import pytest

from obo.database import repository
from obo.database.repository import (
    get_database_auth_level,
    get_signin_vars,
    install_surreal_commands_signin,
    scope_signin_vars,
)


@pytest.fixture
def database_level(monkeypatch):
    monkeypatch.setenv("SURREAL_AUTH_LEVEL", "database")
    monkeypatch.setenv("SURREAL_NAMESPACE", "obo")
    monkeypatch.setenv("SURREAL_DATABASE", "prd")


def test_auth_level_defaults_to_root(monkeypatch):
    monkeypatch.delenv("SURREAL_AUTH_LEVEL", raising=False)

    assert get_database_auth_level() == "root"


def test_auth_level_is_case_insensitive(monkeypatch):
    monkeypatch.setenv("SURREAL_AUTH_LEVEL", " Database ")

    assert get_database_auth_level() == "database"


def test_auth_level_rejects_unknown_value(monkeypatch):
    monkeypatch.setenv("SURREAL_AUTH_LEVEL", "namespace")

    with pytest.raises(ValueError, match="SURREAL_AUTH_LEVEL"):
        get_database_auth_level()


def test_root_level_keeps_username_password_only(monkeypatch):
    monkeypatch.delenv("SURREAL_AUTH_LEVEL", raising=False)

    assert scope_signin_vars({"username": "u", "password": "p"}) == {
        "username": "u",
        "password": "p",
    }


def test_database_level_adds_namespace_and_database(database_level):
    assert scope_signin_vars({"username": "u", "password": "p"}) == {
        "username": "u",
        "password": "p",
        "namespace": "obo",
        "database": "prd",
    }


def test_database_level_keeps_explicit_namespace(database_level):
    signin_vars = {"username": "u", "password": "p", "namespace": "x", "database": "y"}

    assert scope_signin_vars(signin_vars) == signin_vars


def test_get_signin_vars_uses_env(database_level, monkeypatch):
    monkeypatch.setenv("SURREAL_USER", "app_prd")
    monkeypatch.setenv("SURREAL_PASSWORD", "secret")

    assert get_signin_vars() == {
        "username": "app_prd",
        "password": "secret",
        "namespace": "obo",
        "database": "prd",
    }


class _FakeConnection:
    def __init__(self, url):
        self.url = url
        self.signed_in_with = None

    def signin(self, signin_vars):
        self.signed_in_with = signin_vars
        return "token"


def test_surreal_commands_factories_are_scoped(database_level, monkeypatch):
    from surreal_commands import repository as commands_repository
    from surreal_commands.core import service as commands_service

    for module in (commands_repository, commands_service):
        monkeypatch.setattr(module, "AsyncSurreal", _FakeConnection)
        monkeypatch.setattr(module, "Surreal", _FakeConnection)

    install_surreal_commands_signin()
    install_surreal_commands_signin()  # idempotent: wraps only once

    for module in (commands_repository, commands_service):
        for name in ("AsyncSurreal", "Surreal"):
            connection = getattr(module, name)("ws://db/rpc")
            assert isinstance(connection, _FakeConnection)
            assert connection.signin({"username": "u", "password": "p"}) == "token"
            assert connection.signed_in_with == {
                "username": "u",
                "password": "p",
                "namespace": "obo",
                "database": "prd",
            }


def test_scoped_factory_is_marked():
    wrapped = repository._scoped_connection_factory(_FakeConnection)

    assert wrapped._obo_scoped_signin is True
    assert wrapped.__name__ == _FakeConnection.__name__
