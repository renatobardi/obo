from typing import Any, ClassVar, Dict, Literal, Optional

from pydantic import Field

from obo.database.repository import ensure_record_id
from obo.domain.base import ObjectModel, RecordModel


class Transformation(ObjectModel):
    table_name: ClassVar[str] = "transformation"
    scope: ClassVar[Literal["tenant"]] = "tenant"
    nullable_fields: ClassVar[set[str]] = {"model_id"}
    name: str
    title: str
    description: str
    prompt: str
    apply_default: bool
    model_id: Optional[str] = None

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        if data.get("model_id"):
            data["model_id"] = ensure_record_id(data["model_id"])
        return data


class DefaultPrompts(RecordModel):
    record_id: ClassVar[str] = "obo:default_prompts"
    transformation_instructions: Optional[str] = Field(
        None, description="Instructions for executing a transformation"
    )
