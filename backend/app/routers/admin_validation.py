"""Admin + manager CRUD for document validation rules.

Manager scope is enforced per row: a manager can only act on rules whose
`department_id` is in the set of departments they manage. They cannot create
global (department_id=NULL) rules and cannot edit rules created by an admin
even when those rules are scoped to one of their departments.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.dependencies import (
    managed_department_ids,
    require_admin,
    require_manager_or_admin,
)
from app.models.user import User
from app.models.validation_rule import ValidationRule
from app.schemas.validation import (
    ValidationRuleCreate,
    ValidationRuleResponse,
    ValidationRuleUpdate,
)
from app.services import audit

router = APIRouter()


async def _scope_filter_for(
    db: AsyncSession, user: User
) -> Optional[set[uuid.UUID]]:
    """Returns None for admins (no filter), or the set of dept ids a manager
    is allowed to see/touch. A manager always sees admin-authored rules
    scoped to a department they manage too."""
    if user.role == "admin":
        return None
    return await managed_department_ids(db, user.id)


def _manager_can_write(rule: ValidationRule, managed: set[uuid.UUID]) -> bool:
    """Manager write rules: dept must be one they manage, and admin-authored
    rules are read-only to managers."""
    if rule.department_id is None:
        return False
    if rule.department_id not in managed:
        return False
    if rule.created_by_role == "admin":
        return False
    return True


@router.get("", response_model=list[ValidationRuleResponse])
async def list_rules(
    department_id: Optional[uuid.UUID] = Query(None),
    doc_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin),
):
    stmt = select(ValidationRule).order_by(ValidationRule.created_at.desc())
    if department_id is not None:
        stmt = stmt.where(ValidationRule.department_id == department_id)
    if doc_type is not None:
        stmt = stmt.where(ValidationRule.doc_type == doc_type)
    if is_active is not None:
        stmt = stmt.where(ValidationRule.is_active == is_active)

    managed = await _scope_filter_for(db, current_user)
    if managed is not None:
        # Manager: see rules scoped to their departments + global rules (read-only)
        from sqlalchemy import or_

        stmt = stmt.where(
            or_(
                ValidationRule.department_id.is_(None),
                ValidationRule.department_id.in_(managed),
            )
        )

    rules = (await db.scalars(stmt)).all()
    return rules


@router.post(
    "",
    response_model=ValidationRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_rule(
    body: ValidationRuleCreate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin),
):
    is_admin = current_user.role == "admin"

    if not is_admin:
        # Managers must scope to a dept they manage. No globals.
        if body.department_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers must scope rules to a department they manage",
            )
        managed = await managed_department_ids(db, current_user.id)
        if body.department_id not in managed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not manage this department",
            )

    if not is_admin and body.department_id is None and body.doc_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Rule must be scoped to a department or doc_type",
        )

    rule = ValidationRule(
        id=uuid.uuid4(),
        name=body.name,
        description=body.description,
        department_id=body.department_id,
        doc_type=body.doc_type,
        target=body.target,
        operator=body.operator,
        value=body.value,
        severity=body.severity,
        is_active=body.is_active,
        created_by=current_user.id,
        created_by_role="admin" if is_admin else "manager",
    )
    db.add(rule)
    await audit.log(
        db,
        user_id=current_user.id,
        action="validation_rule.create",
        entity_type="validation_rule",
        entity_id=rule.id,
        metadata={
            "name": rule.name,
            "department_id": str(rule.department_id) if rule.department_id else None,
            "doc_type": rule.doc_type,
            "operator": rule.operator,
            "severity": rule.severity,
        },
        request=http_request,
    )
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/{rule_id}", response_model=ValidationRuleResponse)
async def update_rule(
    rule_id: uuid.UUID,
    body: ValidationRuleUpdate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin),
):
    rule = await db.scalar(
        select(ValidationRule).where(ValidationRule.id == rule_id)
    )
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )

    is_admin = current_user.role == "admin"
    if not is_admin:
        managed = await managed_department_ids(db, current_user.id)
        if not _manager_can_write(rule, managed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot edit this rule",
            )
        # Lock down scope-changing + severity for managers — they can't escape
        # their own scope or silently downgrade an error to a warning.
        if body.department_id is not None and body.department_id != rule.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin can change a rule's department",
            )
        if body.severity is not None and body.severity != rule.severity:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin can change a rule's severity",
            )

    update_data = body.model_dump(exclude_unset=True)

    # If operator/value/target change, re-run the same predicate validation
    # the create endpoint uses so we don't end up with bad data in the DB.
    new_operator = update_data.get("operator", rule.operator)
    new_target = update_data.get("target", rule.target)
    new_value = update_data["value"] if "value" in update_data else rule.value
    if {"operator", "target", "value"} & set(update_data):
        ValidationRuleCreate(
            name=update_data.get("name", rule.name),
            description=update_data.get("description", rule.description),
            department_id=update_data.get("department_id", rule.department_id),
            doc_type=update_data.get("doc_type", rule.doc_type),
            target=new_target,
            operator=new_operator,
            value=new_value,
            severity=update_data.get("severity", rule.severity),
            is_active=update_data.get("is_active", rule.is_active),
        )

    for field, value in update_data.items():
        setattr(rule, field, value)

    await audit.log(
        db,
        user_id=current_user.id,
        action="validation_rule.update",
        entity_type="validation_rule",
        entity_id=rule.id,
        metadata=update_data,
        request=http_request,
    )
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin),
):
    rule = await db.scalar(
        select(ValidationRule).where(ValidationRule.id == rule_id)
    )
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )

    if current_user.role != "admin":
        managed = await managed_department_ids(db, current_user.id)
        if not _manager_can_write(rule, managed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this rule",
            )

    await db.delete(rule)
    await audit.log(
        db,
        user_id=current_user.id,
        action="validation_rule.delete",
        entity_type="validation_rule",
        entity_id=rule_id,
        metadata={"name": rule.name},
        request=http_request,
    )
    await db.commit()


@router.post(
    "/{rule_id}/revalidate",
    status_code=status.HTTP_202_ACCEPTED,
)
async def revalidate_rule(
    rule_id: uuid.UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Enqueue an ARQ job that re-runs validation against every completed
    document matching this rule's scope. Admin-only — managers cannot trigger
    this because it can produce a notification fan-out across the org."""
    rule = await db.scalar(
        select(ValidationRule).where(ValidationRule.id == rule_id)
    )
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )

    await audit.log(
        db,
        user_id=current_admin.id,
        action="validation_rule.revalidate",
        entity_type="validation_rule",
        entity_id=rule.id,
        request=http_request,
    )
    await db.commit()

    from arq import create_pool
    from arq.connections import RedisSettings

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await pool.enqueue_job("revalidate_rule", str(rule.id))
    await pool.aclose()

    return {"message": "Revalidation queued", "rule_id": str(rule.id)}
