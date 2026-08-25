import re
from datetime import datetime
from typing import (
    Any,
    ClassVar,
    Dict,
    List,
    Literal,
    Optional,
    Tuple,
    Type,
    TypeVar,
    Union,
    cast,
)

from loguru import logger
from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationError,
    field_validator,
    model_validator,
)

from obo.database.repository import (
    ensure_record_id,
    repo_create,
    repo_delete,
    repo_query,
    repo_relate,
    repo_update,
    repo_upsert,
)
from obo.domain.tenancy import (
    get_current_tenant,
    get_current_user,
    scoped_record_id,
)
from obo.exceptions import (
    DatabaseOperationError,
    InvalidInputError,
    NotFoundError,
)

T = TypeVar("T", bound="ObjectModel")


class ObjectModel(BaseModel):
    id: Optional[str] = None
    table_name: ClassVar[str] = ""
    nullable_fields: ClassVar[set[str]] = set()  # Fields that can be saved as None
    # "none": no tenant/owner scoping (default - opt in explicitly).
    # "tenant": shared within a tenant (e.g. Credential) - filtered/stamped by tenant only.
    # "owner": private to one user within their tenant (e.g. Notebook) - filtered/stamped by both.
    scope: ClassVar[Literal["none", "tenant", "owner"]] = "none"
    created: Optional[datetime] = None
    updated: Optional[datetime] = None
    owner: Optional[str] = None
    tenant: Optional[str] = None

    @classmethod
    def _scope_conditions(cls) -> Tuple[List[str], Dict[str, Any]]:
        """SurrealQL WHERE conditions + bind vars enforcing this class's scope.

        Callers that build their own queries (instead of delegating to
        get_all()/get()) must fold these in too, the same way order_by must
        route through _validate_order_by().
        """
        conditions: List[str] = []
        bind_vars: Dict[str, Any] = {}
        if cls.scope in ("tenant", "owner"):
            conditions.append("tenant = $__tenant")
            bind_vars["__tenant"] = ensure_record_id(get_current_tenant())
        if cls.scope == "owner":
            conditions.append("owner = $__owner")
            bind_vars["__owner"] = ensure_record_id(get_current_user())
        return conditions, bind_vars

    @classmethod
    def _apply_scope(cls, query: str, bind_vars: Dict[str, Any]) -> str:
        """Append this class's scope conditions to `query`, merging their
        bind vars into `bind_vars` (mutated in place). Joins with AND if
        `query` already has a WHERE clause, otherwise adds one - so this can
        run before or after a caller's own WHERE condition.
        """
        conditions, scope_vars = cls._scope_conditions()
        bind_vars.update(scope_vars)
        if not conditions:
            return query
        joiner = " AND " if " WHERE " in query else " WHERE "
        return query + joiner + " AND ".join(conditions)

    @classmethod
    def _validate_order_by(cls, order_by: str) -> str:
        """Validate and normalize an ORDER BY clause to prevent SurrealQL injection.

        Supports: "field", "field direction", "field1 direction, field2 direction".
        Any subclass that builds its own query around `order_by` (instead of
        delegating to `get_all()`) must route through this so the allowlist
        can't silently drift between call sites.
        """
        allowed_field_pattern = re.compile(r"^[a-z_][a-z0-9_]*$")
        allowed_directions = {"asc", "desc"}

        clauses = [c.strip() for c in order_by.split(",")]
        validated_clauses = []
        for clause in clauses:
            parts = clause.strip().split()
            if len(parts) == 1:
                if not allowed_field_pattern.match(parts[0].lower()):
                    raise InvalidInputError(f"Invalid order_by field: '{parts[0]}'")
                validated_clauses.append(parts[0].lower())
            elif len(parts) == 2:
                if not allowed_field_pattern.match(
                    parts[0].lower()
                ) or parts[1].lower() not in allowed_directions:
                    raise InvalidInputError(
                        f"Invalid order_by clause: '{clause.strip()}'"
                    )
                validated_clauses.append(f"{parts[0].lower()} {parts[1].lower()}")
            else:
                raise InvalidInputError(f"Invalid order_by clause: '{clause.strip()}'")

        return ", ".join(validated_clauses)

    @classmethod
    async def get_all(cls: Type[T], order_by=None) -> List[T]:
        try:
            # If called from a specific subclass, use its table_name
            if cls.table_name:
                target_class = cls
                table_name = cls.table_name
            else:
                # This path is taken if called directly from ObjectModel
                raise InvalidInputError(
                    "get_all() must be called from a specific model class"
                )
            bind_vars: Dict[str, Any] = {}
            query = cls._apply_scope(f"SELECT * FROM {table_name}", bind_vars)
            if order_by:
                validated_order_by = cls._validate_order_by(order_by)
                query += f" ORDER BY {validated_order_by}"

            result = await repo_query(query, bind_vars)
            objects = []
            for obj in result:
                try:
                    objects.append(target_class(**obj))
                except Exception as e:
                    logger.critical(f"Error creating object: {str(e)}")

            return objects
        except Exception as e:
            logger.error(f"Error fetching all {cls.table_name}: {str(e)}")
            logger.exception(e)
            raise DatabaseOperationError(e)

    @classmethod
    async def get(cls: Type[T], id: str) -> T:
        if not id:
            raise InvalidInputError("ID cannot be empty")
        try:
            # Get the table name from the ID (everything before the first colon)
            table_name = id.split(":")[0] if ":" in id else id

            # If we're calling from a specific subclass and IDs match, use that class
            if cls.table_name and cls.table_name == table_name:
                target_class: Type[T] = cls
            else:
                # Otherwise, find the appropriate subclass based on table_name
                found_class = cls._get_class_by_table_name(table_name)
                if not found_class:
                    raise InvalidInputError(f"No class found for table {table_name}")
                target_class = cast(Type[T], found_class)

            bind_vars: Dict[str, Any] = {"id": ensure_record_id(id)}
            query = target_class._apply_scope("SELECT * FROM $id", bind_vars)
            result = await repo_query(query, bind_vars)
            if result:
                return target_class(**result[0])
            else:
                raise NotFoundError(f"{table_name} with id {id} not found")
        except Exception as e:
            logger.error(f"Error fetching object with id {id}: {str(e)}")
            logger.exception(e)
            raise NotFoundError(f"Object with id {id} not found - {str(e)}")

    @classmethod
    def _get_class_by_table_name(cls, table_name: str) -> Optional[Type["ObjectModel"]]:
        """Find the appropriate subclass based on table_name."""

        def get_all_subclasses(c: Type["ObjectModel"]) -> List[Type["ObjectModel"]]:
            all_subclasses: List[Type["ObjectModel"]] = []
            for subclass in c.__subclasses__():
                all_subclasses.append(subclass)
                all_subclasses.extend(get_all_subclasses(subclass))
            return all_subclasses

        for subclass in get_all_subclasses(ObjectModel):
            if hasattr(subclass, "table_name") and subclass.table_name == table_name:
                return subclass
        return None

    async def save(self) -> None:
        """
        Save the model to the database.

        Note: Embedding is no longer generated inline. Subclasses that need
        embedding should override save() to submit the appropriate embed_*
        command after calling super().save().
        """
        try:
            if self.id is None and self.__class__.scope in ("tenant", "owner"):
                # Stamp only at creation - an existing record's ownership must
                # not shift just because a later save() runs in another context.
                if self.tenant is None:
                    self.tenant = get_current_tenant()
                if self.__class__.scope == "owner" and self.owner is None:
                    self.owner = get_current_user()

            self.model_validate(self.model_dump(), strict=True)
            data = self._prepare_save_data()
            data["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            repo_result: Union[List[Dict[str, Any]], Dict[str, Any]]
            if self.id is None:
                data["created"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                repo_result = await repo_create(self.__class__.table_name, data)
            else:
                data["created"] = (
                    self.created.strftime("%Y-%m-%d %H:%M:%S")
                    if isinstance(self.created, datetime)
                    else self.created
                )
                logger.debug(f"Updating record with id {self.id}")
                repo_result = await repo_update(
                    self.__class__.table_name, self.id, data
                )
            # Update the current instance with the result
            # repo_result is a list of dictionaries
            result_list: List[Dict[str, Any]] = (
                repo_result if isinstance(repo_result, list) else [repo_result]
            )
            for key, value in result_list[0].items():
                if hasattr(self, key):
                    if isinstance(getattr(self, key), BaseModel):
                        setattr(self, key, type(getattr(self, key))(**value))
                    else:
                        setattr(self, key, value)

        except ValidationError as e:
            logger.error(f"Validation failed: {e}")
            raise
        except RuntimeError:
            # Transaction conflicts should propagate for retry
            raise
        except Exception as e:
            logger.error(f"Error saving record: {e}")
            raise DatabaseOperationError(e)

    def _convert_scope_ids(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Turn stamped owner/tenant strings into RecordIDs before they hit the DB.

        Subclasses whose _prepare_save_data() doesn't delegate to
        super() (e.g. Credential) must call this themselves.
        """
        if self.__class__.scope in ("tenant", "owner") and data.get("tenant"):
            data["tenant"] = ensure_record_id(data["tenant"])
        if self.__class__.scope == "owner" and data.get("owner"):
            data["owner"] = ensure_record_id(data["owner"])
        return data

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = self._convert_scope_ids(self.model_dump())
        return {
            key: value
            for key, value in data.items()
            if value is not None or key in self.__class__.nullable_fields
        }

    async def delete(self) -> bool:
        if self.id is None:
            raise InvalidInputError("Cannot delete object without an ID")
        try:
            logger.debug(f"Deleting record with id {self.id}")
            return await repo_delete(self.id)
        except Exception as e:
            logger.error(
                f"Error deleting {self.__class__.table_name} with id {self.id}: {str(e)}"
            )
            raise DatabaseOperationError(
                f"Failed to delete {self.__class__.table_name}"
            )

    async def relate(
        self, relationship: str, target_id: str, data: Optional[Dict] = {}
    ) -> Any:
        if not relationship or not target_id or not self.id:
            raise InvalidInputError("Relationship and target ID must be provided")
        try:
            return await repo_relate(
                source=self.id, relationship=relationship, target=target_id, data=data
            )
        except Exception as e:
            logger.error(f"Error creating relationship: {str(e)}")
            logger.exception(e)
            raise DatabaseOperationError(e)

    @field_validator("created", "updated", mode="before")
    @classmethod
    def parse_datetime(cls, value):
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value


class RecordModel(BaseModel):
    model_config = ConfigDict(
        validate_assignment=True,
        arbitrary_types_allowed=True,
        extra="allow",
        from_attributes=True,
        defer_build=True,
    )

    record_id: ClassVar[str]
    auto_save: ClassVar[bool] = (
        False  # Default to False, can be overridden in subclasses
    )
    # Keyed by (class, tenant) - every RecordModel singleton is tenant-scoped,
    # so the same class holds one cached instance per tenant.
    _instances: ClassVar[Dict[Tuple[type, str], "RecordModel"]] = {}

    @classmethod
    def _current_scoped_id(cls) -> str:
        """This class's actual DB record id for the current tenant context."""
        return scoped_record_id(cls.record_id, get_current_tenant())

    def __new__(cls, **kwargs):
        # If an instance already exists for this (class, tenant), return it
        key = (cls, get_current_tenant())
        if key in cls._instances:
            instance = cls._instances[key]
            # Update instance with any new kwargs if provided
            if kwargs:
                for k, value in kwargs.items():
                    setattr(instance, k, value)
            return instance

        # If no instance exists, create a new one
        instance = super().__new__(cls)
        cls._instances[key] = instance
        return instance

    def __init__(self, **kwargs):
        # Only initialize if this is a new instance
        if not hasattr(self, "_initialized"):
            object.__setattr__(self, "__dict__", {})

            # For RecordModel, we need to handle async initialization differently
            # Initialize with provided kwargs only for now
            super().__init__(**kwargs)

            # Mark as initialized but not loaded from DB yet
            object.__setattr__(self, "_initialized", True)
            object.__setattr__(self, "_db_loaded", False)

    async def _load_from_db(self):
        """Load data from database if not already loaded"""
        if not getattr(self, "_db_loaded", False):
            result = await repo_query(
                "SELECT * FROM ONLY $record_id",
                {"record_id": ensure_record_id(self.__class__._current_scoped_id())},
            )

            # Handle case where record doesn't exist yet
            if result:
                if isinstance(result, list) and len(result) > 0:
                    # Standard list response
                    row = result[0]
                    if isinstance(row, dict):
                        for key, value in row.items():
                            if hasattr(self, key):
                                object.__setattr__(self, key, value)
                elif isinstance(result, dict):
                    # Direct dict response
                    for key, value in result.items():
                        if hasattr(self, key):
                            object.__setattr__(self, key, value)

            object.__setattr__(self, "_db_loaded", True)

    @classmethod
    async def get_instance(cls) -> "RecordModel":
        """Get or create the singleton instance and load from DB"""
        instance = cls()
        await instance._load_from_db()
        return instance

    @model_validator(mode="after")
    def auto_save_validator(self):
        if self.__class__.auto_save:
            # Auto-save can't work with async - log warning
            logger.warning(
                f"Auto-save is enabled for {self.__class__.__name__} but update() is now async. Call await instance.update() manually."
            )
        return self

    async def update(self):
        # Get all non-ClassVar fields and their values
        data = {
            field_name: getattr(self, field_name)
            for field_name, field_info in self.model_fields.items()
            if not str(field_info.annotation).startswith("typing.ClassVar")
        }

        scoped_id = self.__class__._current_scoped_id()
        await repo_upsert(
            self.__class__.table_name
            if hasattr(self.__class__, "table_name")
            else "record",
            scoped_id,
            data,
        )

        result = await repo_query(
            "SELECT * FROM $record_id", {"record_id": ensure_record_id(scoped_id)}
        )
        if result:
            for key, value in result[0].items():
                if hasattr(self, key):
                    object.__setattr__(
                        self, key, value
                    )  # Use object.__setattr__ to avoid triggering validation again

        return self

    @classmethod
    def clear_instance(cls):
        """Clear the singleton instance for the current tenant context (useful for testing)"""
        cls._instances.pop((cls, get_current_tenant()), None)

    async def patch(self, model_dict: dict):
        """Update model attributes from dictionary and save"""
        for key, value in model_dict.items():
            setattr(self, key, value)
        await self.update()
