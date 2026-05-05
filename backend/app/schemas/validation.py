import re
import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

ALLOWED_DOC_TYPES = {"contract", "invoice", "report", "letter", "permit", "other"}
ALLOWED_TARGETS = {"ocr_text", "title", "tags", "physical_location"}
ALLOWED_OPERATORS = {
    "contains",
    "not_contains",
    "regex",
    "any_of",
    "all_of",
    "min_length",
    "min_word_count",
    "date_present",
    "exists",
}
ALLOWED_SEVERITIES = {"error", "warning"}

REGEX_MAX_LEN = 500
ARRAY_OPERATORS = {"any_of", "all_of"}
INT_OPERATORS = {"min_length", "min_word_count"}
NULLARY_OPERATORS = {"date_present", "exists"}
STRING_OPERATORS = {"contains", "not_contains", "regex"}


def _validate_value(operator: str, value: Any) -> None:
    if operator in NULLARY_OPERATORS:
        if value not in (None, "", [], {}):
            raise ValueError(f"Operator '{operator}' takes no value")
        return
    if operator in STRING_OPERATORS:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"Operator '{operator}' requires a non-empty string value")
        if operator == "regex":
            if len(value) > REGEX_MAX_LEN:
                raise ValueError(f"Regex must be ≤ {REGEX_MAX_LEN} characters")
            try:
                re.compile(value)
            except re.error as exc:
                raise ValueError(f"Invalid regex: {exc}") from exc
        return
    if operator in ARRAY_OPERATORS:
        if not isinstance(value, list) or not value:
            raise ValueError(f"Operator '{operator}' requires a non-empty array")
        if not all(isinstance(v, str) and v.strip() for v in value):
            raise ValueError(f"Operator '{operator}' values must be non-empty strings")
        if len(value) > 50:
            raise ValueError(f"Operator '{operator}' supports at most 50 values")
        return
    if operator in INT_OPERATORS:
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise ValueError(f"Operator '{operator}' requires a positive integer")
        return


class ValidationRuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    doc_type: Optional[str] = None
    target: str
    operator: str
    value: Optional[Any] = None
    severity: str = "error"
    is_active: bool = True

    @model_validator(mode="after")
    def _validate(self) -> "ValidationRuleBase":
        if self.target not in ALLOWED_TARGETS:
            raise ValueError(f"target must be one of {sorted(ALLOWED_TARGETS)}")
        if self.operator not in ALLOWED_OPERATORS:
            raise ValueError(f"operator must be one of {sorted(ALLOWED_OPERATORS)}")
        if self.severity not in ALLOWED_SEVERITIES:
            raise ValueError(f"severity must be one of {sorted(ALLOWED_SEVERITIES)}")
        if self.doc_type is not None and self.doc_type not in ALLOWED_DOC_TYPES:
            raise ValueError(f"doc_type must be one of {sorted(ALLOWED_DOC_TYPES)}")
        # `tags` target is only meaningful for substring-style operators
        if self.target == "tags" and self.operator in INT_OPERATORS:
            raise ValueError("tags target does not support length-based operators")
        _validate_value(self.operator, self.value)
        return self


class ValidationRuleCreate(ValidationRuleBase):
    pass


class ValidationRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    department_id: Optional[uuid.UUID] = None  # admin-only on PATCH
    doc_type: Optional[str] = None
    target: Optional[str] = None
    operator: Optional[str] = None
    value: Optional[Any] = None
    severity: Optional[str] = None  # admin-only on PATCH
    is_active: Optional[bool] = None


class ValidationRuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    department_id: Optional[uuid.UUID]
    doc_type: Optional[str]
    target: str
    operator: str
    value: Optional[Any]
    severity: str
    is_active: bool
    created_by: uuid.UUID
    created_by_role: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ValidationResultItem(BaseModel):
    rule_id: uuid.UUID
    rule_name: str
    severity: str
    passed: bool
    message: str


class DocumentValidationResponse(BaseModel):
    validation_status: str
    validation_results: Optional[list[ValidationResultItem]] = None
    validated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
