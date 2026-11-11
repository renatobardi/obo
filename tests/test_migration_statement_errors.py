"""Migrations must fail when ANY statement fails, not only the first."""

import pytest

from obo.database.async_migrate import raise_on_failed_statements


def test_all_statements_ok_passes():
    raise_on_failed_statements(
        {"result": [{"status": "OK", "result": None}, {"status": "OK", "result": []}]}
    )


def test_failure_in_a_later_statement_raises():
    response = {
        "result": [
            {"status": "OK", "result": None},
            {"status": "ERR", "result": "Parse error: SEARCH"},
        ]
    }

    with pytest.raises(RuntimeError, match="statement 2: Parse error: SEARCH"):
        raise_on_failed_statements(response)


def test_rpc_level_error_raises():
    with pytest.raises(RuntimeError, match="Parse error"):
        raise_on_failed_statements(
            {"error": {"code": -32000, "message": "Parse error"}}
        )


def test_empty_result_passes():
    raise_on_failed_statements({"result": []})
