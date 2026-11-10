"""Surreal-commands integration for Obo"""

# The worker starts via `surreal-commands-worker --import-modules commands`,
# so this package is imported before the worker connects to SurrealDB. Inject
# the internal DB hosts into no_proxy first so the DB websocket is never
# tunnelled through a configured HTTP proxy (issue #1160).
from obo.utils.proxy import ensure_internal_no_proxy

ensure_internal_no_proxy()

# surreal-commands signs in as a root-level user; scope it to namespace +
# database when SURREAL_AUTH_LEVEL=database (shared oute-surreal-db).
from obo.database.repository import install_surreal_commands_signin  # noqa: E402

install_surreal_commands_signin()

from .embedding_commands import (
    embed_insight_command,
    embed_note_command,
    embed_source_command,
    rebuild_embeddings_command,
)
from .podcast_commands import generate_podcast_command
from .source_commands import process_source_command

__all__ = [
    # Embedding commands
    "embed_note_command",
    "embed_insight_command",
    "embed_source_command",
    "rebuild_embeddings_command",
    # Other commands
    "generate_podcast_command",
    "process_source_command",
]
