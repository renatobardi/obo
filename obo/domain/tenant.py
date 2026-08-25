"""
Tenant and User domain models (schema from #26, provisioning from #27).

Neither is itself tenant/owner-scoped (ObjectModel.scope defaults to "none")
- they ARE the scoping boundary other entities point at, not entities scoped
by it. Both reuse ObjectModel's inherited `owner`/`tenant` fields for their
own (unrelated but same-shaped) purpose: a Tenant's `owner` is the User that
owns it; a User's `tenant` is the Tenant it belongs to.
"""

from typing import Any, ClassVar, Dict

from surrealdb import RecordID

from obo.database.repository import ensure_record_id, repo_query
from obo.domain.base import ObjectModel


class Tenant(ObjectModel):
    table_name: ClassVar[str] = "tenant"

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        if data.get("owner"):
            data["owner"] = ensure_record_id(data["owner"])
        return data


class User(ObjectModel):
    """A signed-in identity. `id` is the Firebase UID (`user:<uid>`), not an
    auto-generated id - so creation goes through provision() (an explicit-id
    upsert) rather than the inherited save(), which always lets the DB
    generate a new id on create.
    """

    table_name: ClassVar[str] = "user"

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        if data.get("tenant"):
            data["tenant"] = ensure_record_id(data["tenant"])
        return data

    @classmethod
    async def provision(cls, uid: str, tenant_id: str) -> "User":
        """Create (or idempotently return) the user row for a Firebase UID.

        Builds the RecordID directly from the raw uid instead of going
        through ensure_record_id(f"user:{uid}") - RecordID.parse() treats a
        purely-numeric id part specially (SurrealDB's `<record>` vs
        `<number>` distinction), which a real-world Firebase UID could
        collide with.
        """
        user_id = RecordID("user", uid)
        result = await repo_query(
            "UPSERT $target MERGE $data;",
            {"target": user_id, "data": {"tenant": ensure_record_id(tenant_id)}},
        )
        row = result[0] if isinstance(result, list) else result
        return cls(**row)
