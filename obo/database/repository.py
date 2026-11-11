import functools
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, TypeVar, Union

from loguru import logger
from surrealdb import AsyncSurreal, RecordID  # type: ignore
from surrealdb.data.types.table import Table  # type: ignore

from obo.utils.proxy import ensure_internal_no_proxy

# Keep the internal SurrealDB websocket out of any configured HTTP proxy
# (issue #1160). Runs at import time - i.e. before any db_connection() can be
# opened - so it protects every entrypoint (API + worker) that touches the DB.
ensure_internal_no_proxy()

T = TypeVar("T", Dict[str, Any], List[Dict[str, Any]])

# Bare SurrealDB table/relation identifier: no ':', whitespace, or query
# syntax. Used to validate the parts of RELATE/UPSERT/UPDATE that name a
# table or edge-relation and therefore can't be bound as a query parameter
# (SurrealQL only allows binding record/table *values*, not identifiers in
# that position).
_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _ensure_safe_identifier(value: str, kind: str) -> str:
    """Validate a table/relationship name before it is interpolated into a query."""
    if not isinstance(value, str) or not _IDENTIFIER_RE.match(value):
        raise ValueError(f"Invalid {kind} name: {value!r}")
    return value


def _get_env_or_default(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value else default


def get_database_url() -> str:
    """Get database URL with backward compatibility"""
    surreal_url = os.getenv("SURREAL_URL")
    if surreal_url:
        return surreal_url

    # Fallback to old format - WebSocket URL format
    address = os.getenv("SURREAL_ADDRESS", "localhost")
    port = os.getenv("SURREAL_PORT", "8000")
    return f"ws://{address}/rpc:{port}"


def get_database_password() -> str:
    """Get password with backward compatibility"""
    return os.getenv("SURREAL_PASSWORD") or os.getenv("SURREAL_PASS") or "root"


def get_database_namespace() -> str:
    """Get configured SurrealDB namespace."""
    return _get_env_or_default("SURREAL_NAMESPACE", "obo")


def get_database_name() -> str:
    """Get configured SurrealDB database name."""
    return _get_env_or_default("SURREAL_DATABASE", "obo")


# Signin level of SURREAL_USER. "root" (default) keeps the historical behavior
# of a root-level user (local docker-compose). "database" is a database-level
# user, which must sign in with namespace + database: the shared
# oute-surreal-db instance only issues database-level users.
AUTH_LEVEL_ENV = "SURREAL_AUTH_LEVEL"
_AUTH_LEVELS = ("root", "database")


def get_database_auth_level() -> str:
    """Get the configured signin level (root or database)."""
    level = _get_env_or_default(AUTH_LEVEL_ENV, "root").strip().lower()
    if level not in _AUTH_LEVELS:
        raise ValueError(
            f"Invalid {AUTH_LEVEL_ENV}: {level!r} (expected one of {_AUTH_LEVELS})"
        )
    return level


def scope_signin_vars(signin_vars: Dict[str, Any]) -> Dict[str, Any]:
    """Add namespace/database to signin vars when the user is database-level.

    Vars that already name a namespace are left untouched, so explicit callers
    always win.
    """
    if get_database_auth_level() != "database" or "namespace" in signin_vars:
        return signin_vars
    return {
        **signin_vars,
        "namespace": get_database_namespace(),
        "database": get_database_name(),
    }


def get_signin_vars() -> Dict[str, Any]:
    """Signin vars for the configured SurrealDB user."""
    return scope_signin_vars(
        {
            "username": os.environ.get("SURREAL_USER"),
            "password": get_database_password(),
        }
    )


def _scope_connection_signin(connection: Any) -> Any:
    original_signin = connection.signin

    def signin(signin_vars: Dict[str, Any]) -> Any:
        # Returns the coroutine of async connections unchanged.
        return original_signin(scope_signin_vars(signin_vars))

    connection.signin = signin
    return connection


def _scoped_connection_factory(factory: Any) -> Any:
    @functools.wraps(factory)
    def make_connection(*args: Any, **kwargs: Any) -> Any:
        return _scope_connection_signin(factory(*args, **kwargs))

    make_connection._obo_scoped_signin = True  # type: ignore[attr-defined]
    return make_connection


def install_surreal_commands_signin() -> None:
    """Make surreal-commands sign in at the configured level.

    surreal-commands (job queue: API submit + worker) always signs in with
    username/password only, i.e. as a root-level user. Wrapping the SDK
    factories it imported lets the same database-level user work for the
    queue, without forking the library. Idempotent.
    """
    from surreal_commands import repository as commands_repository
    from surreal_commands.core import service as commands_service

    for module in (commands_repository, commands_service):
        for name in ("AsyncSurreal", "Surreal"):
            factory = getattr(module, name, None)
            if factory is None or getattr(factory, "_obo_scoped_signin", False):
                continue
            setattr(module, name, _scoped_connection_factory(factory))


install_surreal_commands_signin()


def parse_record_ids(obj: Any) -> Any:
    """Recursively parse and convert RecordIDs into strings."""
    if isinstance(obj, dict):
        return {k: parse_record_ids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [parse_record_ids(item) for item in obj]
    elif isinstance(obj, RecordID):
        return str(obj)
    return obj


def ensure_record_id(value: Union[str, RecordID]) -> RecordID:
    """Ensure a value is a RecordID."""
    if isinstance(value, RecordID):
        return value
    return RecordID.parse(value)


@asynccontextmanager
async def db_connection():
    db = AsyncSurreal(get_database_url())
    await db.signin(get_signin_vars())
    await db.use(get_database_namespace(), get_database_name())
    try:
        yield db
    finally:
        await db.close()


async def repo_query(
    query_str: str, vars: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Execute a SurrealQL query and return the results"""

    async with db_connection() as connection:
        try:
            result = parse_record_ids(await connection.query(query_str, vars))
            if isinstance(result, str):
                raise RuntimeError(result)
            return result
        except RuntimeError as e:
            # RuntimeError is raised for retriable transaction conflicts - log at debug to avoid noise
            logger.debug(str(e))
            raise
        except Exception as e:
            logger.exception(e)
            raise


async def repo_create(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new record in the specified table"""
    # Remove 'id' attribute if it exists in data
    data.pop("id", None)
    data["created"] = datetime.now(timezone.utc)
    data["updated"] = datetime.now(timezone.utc)
    try:
        async with db_connection() as connection:
            result = parse_record_ids(await connection.insert(table, data))
            # SurrealDB may return a string error message instead of the expected record
            if isinstance(result, str):
                raise RuntimeError(result)
            return result
    except RuntimeError as e:
        logger.error(str(e))
        raise
    except Exception as e:
        logger.exception(e)
        raise RuntimeError("Failed to create record")


async def repo_relate(
    source: Union[str, RecordID],
    relationship: str,
    target: Union[str, RecordID],
    data: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Create a relationship between two records with optional data"""
    if data is None:
        data = {}
    # relationship is an edge-table name, not a record value, so it can't be
    # bound as a query parameter; validate it against an identifier allowlist
    # instead of trusting the caller. source/target are always bound.
    _ensure_safe_identifier(relationship, "relationship")
    query = f"RELATE $source->{relationship}->$target CONTENT $data;"
    # logger.debug(f"Relate query: {query}")

    return await repo_query(
        query,
        {
            "source": ensure_record_id(source),
            "target": ensure_record_id(target),
            "data": data,
        },
    )


async def repo_upsert(
    table: str, id: Optional[str], data: Dict[str, Any], add_timestamp: bool = False
) -> List[Dict[str, Any]]:
    """Create or update a record in the specified table"""
    data.pop("id", None)
    if add_timestamp:
        data["updated"] = datetime.now(timezone.utc)
    _ensure_safe_identifier(table, "table")
    target: Union[RecordID, Table] = ensure_record_id(id) if id else Table(table)
    query = "UPSERT $target MERGE $data;"
    return await repo_query(query, {"target": target, "data": data})


async def repo_update(
    table: str, id: Union[str, RecordID], data: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Update an existing record by table and id"""
    # If id already contains the table name, use it as is
    try:
        _ensure_safe_identifier(table, "table")
        if isinstance(id, RecordID):
            record_id: RecordID = id
        elif ":" in id and id.startswith(f"{table}:"):
            record_id = ensure_record_id(id)
        else:
            record_id = RecordID(table, id)
        data.pop("id", None)
        if "created" in data and isinstance(data["created"], str):
            data["created"] = datetime.fromisoformat(data["created"])
        data["updated"] = datetime.now(timezone.utc)
        query = "UPDATE $target MERGE $data;"
        # logger.debug(f"Update query: {query}")
        result = await repo_query(query, {"target": record_id, "data": data})
        # if isinstance(result, list):
        #     return [_return_data(item) for item in result]
        return parse_record_ids(result)
    except Exception as e:
        raise RuntimeError(f"Failed to update record: {str(e)}")


async def repo_delete(record_id: Union[str, RecordID]):
    """Delete a record by record id"""

    try:
        async with db_connection() as connection:
            return await connection.delete(ensure_record_id(record_id))
    except Exception as e:
        logger.exception(e)
        raise RuntimeError(f"Failed to delete record: {str(e)}")


async def repo_insert(
    table: str, data: List[Dict[str, Any]], ignore_duplicates: bool = False
) -> List[Dict[str, Any]]:
    """Create a new record in the specified table"""
    try:
        async with db_connection() as connection:
            result = parse_record_ids(await connection.insert(table, data))
            # SurrealDB may return a string error message instead of the expected records
            if isinstance(result, str):
                raise RuntimeError(result)
            return result
    except RuntimeError as e:
        if ignore_duplicates and "already contains" in str(e):
            return []
        # Log transaction conflicts at debug level (they are expected during concurrent operations)
        error_str = str(e).lower()
        if "transaction" in error_str or "conflict" in error_str:
            logger.debug(str(e))
        else:
            logger.error(str(e))
        raise
    except Exception as e:
        if ignore_duplicates and "already contains" in str(e):
            return []
        logger.exception(e)
        raise RuntimeError("Failed to create record")
