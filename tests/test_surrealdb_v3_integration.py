"""Integration tests against a real SurrealDB v3 (shared oute-surreal-db shape).

Skipped unless OBO_TEST_SURREAL_URL points at a SurrealDB v3 server with a
root user (OBO_TEST_SURREAL_ROOT_USER / OBO_TEST_SURREAL_ROOT_PASSWORD).
Each test run creates a throwaway namespace with a database-level OWNER user,
the same auth model as production, and removes it afterwards.

    docker run --rm -p 8000:8000 surrealdb/surrealdb:v3.3.0 \
        start --user root --pass root surrealkv://data
    OBO_TEST_SURREAL_URL=ws://127.0.0.1:8000/rpc uv run pytest \
        tests/test_surrealdb_v3_integration.py
"""

import os
import uuid
from typing import Any

import pytest
import pytest_asyncio
from surrealdb import AsyncSurreal  # type: ignore

from obo.database.async_migrate import AsyncMigrationManager
from obo.database.repository import repo_query

SURREAL_URL = os.getenv("OBO_TEST_SURREAL_URL")
ROOT_USER = os.getenv("OBO_TEST_SURREAL_ROOT_USER", "root")
ROOT_PASSWORD = os.getenv("OBO_TEST_SURREAL_ROOT_PASSWORD", "root")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not SURREAL_URL, reason="OBO_TEST_SURREAL_URL not set"),
]

APP_USER = "app_it"
APP_PASSWORD = "integration-only-" + uuid.uuid4().hex


async def _root_query(sql: str):
    assert SURREAL_URL
    db = AsyncSurreal(SURREAL_URL)
    try:
        await db.signin({"username": ROOT_USER, "password": ROOT_PASSWORD})
        return await db.query_raw(sql)
    finally:
        await db.close()


@pytest_asyncio.fixture
async def database_level_env(monkeypatch):
    namespace = "obo_it_" + uuid.uuid4().hex[:8]
    await _root_query(
        f"DEFINE NAMESPACE {namespace}; USE NS {namespace}; DEFINE DATABASE prd; "
        f"USE NS {namespace} DB prd; "
        f"DEFINE USER {APP_USER} ON DATABASE PASSWORD '{APP_PASSWORD}' ROLES OWNER;"
    )
    monkeypatch.setenv("SURREAL_URL", SURREAL_URL)
    monkeypatch.setenv("SURREAL_AUTH_LEVEL", "database")
    monkeypatch.setenv("SURREAL_NAMESPACE", namespace)
    monkeypatch.setenv("SURREAL_DATABASE", "prd")
    monkeypatch.setenv("SURREAL_USER", APP_USER)
    monkeypatch.setenv("SURREAL_PASSWORD", APP_PASSWORD)
    yield namespace
    await _root_query(f"REMOVE NAMESPACE IF EXISTS {namespace};")


async def _seed():
    await repo_query(
        """
        CREATE source:kafka SET title = 'Kafka streams guide',
            full_text = 'Apache Kafka is a distributed log', asset = {url: 'http://x'};
        CREATE source:pg SET title = 'Postgres tuning', full_text = 'vacuum and indexes';
        CREATE source:redis SET title = 'Redis caching', full_text = 'cache eviction';
        CREATE source_embedding SET source = source:pg, order = 0,
            content = 'postgres vacuum autovacuum', embedding = [0.9, 0.1, 0.0];
        CREATE source_embedding SET source = source:pg, order = 1,
            content = 'postgres indexes', embedding = [0.8, 0.2, 0.0];
        CREATE source_insight SET source = source:pg, insight_type = 'summary',
            content = 'postgres needs vacuum', embedding = [0.85, 0.15, 0.0];
        CREATE note:pg SET title = 'nota postgres', content = 'postgres notes',
            embedding = [0.7, 0.3, 0.0];
        """
    )


async def test_migrations_from_zero_down_and_up_again(database_level_env):
    manager = AsyncMigrationManager()
    total = len(manager.up_migrations)

    await manager.run_migration_up()
    assert await manager.get_current_version() == total

    # INFO returns one object, not a list of rows.
    info: Any = await repo_query("INFO FOR DB;")
    assert {"text_search", "vector_search"} <= set(info["functions"])
    assert "command" in info["tables"]
    table_info: Any = await repo_query("INFO FOR TABLE source;")
    indexes = table_info["indexes"]
    assert "FULLTEXT" in indexes["idx_source_title"]

    # Migration 20 links every default episode profile to its speaker profile.
    configs = await repo_query("SELECT VALUE speaker_config FROM episode_profile;")
    assert configs and all(str(c).startswith("speaker_profile:") for c in configs)

    for _ in range(total):
        await manager.runner.run_one_down()
    assert await manager.get_current_version() == 0

    await manager.run_migration_up()
    assert await manager.get_current_version() == total


async def test_search_functions_return_v2_shapes(database_level_env):
    await AsyncMigrationManager().run_migration_up()
    await _seed()

    text = await repo_query(
        "SELECT * FROM fn::text_search('postgres', 10, true, true);"
    )
    assert {row["id"] for row in text} >= {"source:pg", "note:pg"}
    assert len({row["id"] for row in text}) == len(text)  # one row per item
    for row in text:
        assert isinstance(row["title"], str)
        assert isinstance(row["parent_id"], str)

    vector = await repo_query(
        "SELECT * FROM fn::vector_search([0.9, 0.1, 0.0], 10, true, true, 0.5);"
    )
    by_id = {row["id"]: row for row in vector}
    assert set(by_id) >= {"source:pg", "note:pg"}
    assert sorted(by_id["source:pg"]["matches"]) == [
        "postgres indexes",
        "postgres vacuum autovacuum",
    ]
    assert vector == sorted(vector, key=lambda row: row["similarity"], reverse=True)


async def test_failed_statement_fails_the_migration(database_level_env):
    from obo.database.async_migrate import AsyncMigration

    bad = AsyncMigration("DEFINE TABLE ok_table; SELECT * FROM missing_table;")
    with pytest.raises(RuntimeError, match="statement 2"):
        await bad.run(bump=False)


async def test_surreal_commands_signs_in_with_database_user(database_level_env):
    await AsyncMigrationManager().run_migration_up()

    from surreal_commands import repository as commands_repository

    from obo.database.repository import install_surreal_commands_signin

    install_surreal_commands_signin()
    async with commands_repository.db_connection() as db:
        result = await db.query("SELECT count() FROM command GROUP ALL;")
    assert result == [{"count": 0}]
