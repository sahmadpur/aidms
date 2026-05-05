"""Document validation against admin/manager-defined rules.

Runs in the OCR worker after chunk_and_embed; also from PATCH and admin
revalidate endpoints. Stays transaction-friendly (no commits) so callers
control the unit of work.
"""

import asyncio
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.notification import Notification
from app.models.user import User
from app.models.validation_rule import ValidationRule
from app.services.notifications import managers_of, notify_many

# Hard caps — see plan §"Gotchas locked in"
TEXT_TRUNCATE_BYTES = 2 * 1024 * 1024  # 2 MB
REGEX_TIMEOUT_SECONDS = 0.05  # 50 ms
NOTIFICATION_DEDUPE_WINDOW = timedelta(hours=1)
NOTIFICATION_TYPE = "validation_failed"

_DATE_PATTERN = re.compile(
    r"\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b"
)

_regex_cache: dict[str, re.Pattern[str]] = {}


@dataclass
class RuleResult:
    rule_id: uuid.UUID
    rule_name: str
    severity: str
    passed: bool
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": str(self.rule_id),
            "rule_name": self.rule_name,
            "severity": self.severity,
            "passed": self.passed,
            "message": self.message,
        }


@dataclass
class ValidationOutcome:
    status: str  # passed | failed | skipped
    results: list[RuleResult] = field(default_factory=list)
    failed_rules: list[RuleResult] = field(default_factory=list)


def _read_target(doc: Document, target: str) -> str:
    if target == "ocr_text":
        text = doc.ocr_text or ""
    elif target == "title":
        text = doc.title or ""
    elif target == "tags":
        text = " ".join(doc.tags or [])
    elif target == "physical_location":
        text = doc.physical_location or ""
    else:
        text = ""
    if len(text) > TEXT_TRUNCATE_BYTES:
        text = text[:TEXT_TRUNCATE_BYTES]
    return text


def _compile_cached(pattern: str) -> re.Pattern[str]:
    cached = _regex_cache.get(pattern)
    if cached is not None:
        return cached
    compiled = re.compile(pattern, re.IGNORECASE | re.DOTALL)
    if len(_regex_cache) > 256:
        _regex_cache.clear()
    _regex_cache[pattern] = compiled
    return compiled


async def _regex_search(pattern: re.Pattern[str], text: str) -> Optional[re.Match[str]]:
    """Run regex.search in a thread with a hard deadline.

    Pure-Python `re` can blow up on catastrophic backtracking; we don't add a
    new dep on google-re2, so this is the safety net.
    """
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(None, pattern.search, text),
        timeout=REGEX_TIMEOUT_SECONDS,
    )


async def evaluate_rule(rule: ValidationRule, doc: Document) -> RuleResult:
    text = _read_target(doc, rule.target)
    op = rule.operator
    val = rule.value

    try:
        if op == "exists":
            ok = bool(text and text.strip())
            msg = "" if ok else f"{rule.target} is empty"
        elif op == "min_length":
            ok = len(text) >= int(val)
            msg = (
                ""
                if ok
                else f"{rule.target} length {len(text)} < required {val}"
            )
        elif op == "min_word_count":
            words = len([w for w in text.split() if w])
            ok = words >= int(val)
            msg = "" if ok else f"{rule.target} word count {words} < required {val}"
        elif op == "contains":
            ok = isinstance(val, str) and val.lower() in text.lower()
            msg = "" if ok else f"missing required text: {val!r}"
        elif op == "not_contains":
            ok = isinstance(val, str) and val.lower() not in text.lower()
            msg = "" if ok else f"contains forbidden text: {val!r}"
        elif op == "any_of":
            lower = text.lower()
            ok = any(isinstance(v, str) and v.lower() in lower for v in val or [])
            msg = "" if ok else f"none of {val} found"
        elif op == "all_of":
            lower = text.lower()
            ok = all(isinstance(v, str) and v.lower() in lower for v in val or [])
            if not ok:
                missing = [v for v in val or [] if v.lower() not in lower]
                msg = f"missing: {missing}"
            else:
                msg = ""
        elif op == "date_present":
            match = _DATE_PATTERN.search(text)
            ok = match is not None
            msg = "" if ok else "no date pattern detected"
        elif op == "regex":
            pattern = _compile_cached(str(val))
            try:
                match = await _regex_search(pattern, text)
            except asyncio.TimeoutError:
                return RuleResult(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    passed=False,
                    message="evaluation timed out",
                )
            ok = match is not None
            msg = "" if ok else f"regex did not match: {val!r}"
        else:
            return RuleResult(
                rule_id=rule.id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=False,
                message=f"unknown operator: {op}",
            )
    except (TypeError, ValueError) as exc:
        return RuleResult(
            rule_id=rule.id,
            rule_name=rule.name,
            severity=rule.severity,
            passed=False,
            message=f"rule misconfigured: {exc}",
        )

    return RuleResult(
        rule_id=rule.id,
        rule_name=rule.name,
        severity=rule.severity,
        passed=ok,
        message=msg,
    )


async def applicable_rules(
    db: AsyncSession, doc: Document
) -> list[ValidationRule]:
    stmt = select(ValidationRule).where(
        ValidationRule.is_active.is_(True),
        or_(
            ValidationRule.department_id.is_(None),
            ValidationRule.department_id == doc.department_id,
        ),
        or_(
            ValidationRule.doc_type.is_(None),
            ValidationRule.doc_type == doc.doc_type,
        ),
    )
    rows = await db.execute(stmt)
    return list(rows.scalars().all())


async def validate_document(
    db: AsyncSession,
    doc: Document,
) -> ValidationOutcome:
    """Evaluate every applicable rule against `doc` and update its
    validation_status / validation_results / validated_at fields.

    Caller controls commit. No notifications are sent here; use
    `notify_validation_failed` after you have the outcome.
    """
    rules = await applicable_rules(db, doc)
    if not rules:
        doc.validation_status = "skipped"
        doc.validation_results = []
        doc.validated_at = datetime.now(timezone.utc)
        return ValidationOutcome(status="skipped")

    doc.validation_status = "pending"

    results: list[RuleResult] = []
    for rule in rules:
        result = await evaluate_rule(rule, doc)
        results.append(result)

    failed_errors = [
        r for r in results if not r.passed and r.severity == "error"
    ]
    status = "failed" if failed_errors else "passed"

    doc.validation_status = status
    doc.validation_results = [r.to_dict() for r in results]
    doc.validated_at = datetime.now(timezone.utc)

    return ValidationOutcome(
        status=status,
        results=results,
        failed_rules=failed_errors,
    )


async def _filter_recent_notified(
    db: AsyncSession,
    user_ids: Iterable[uuid.UUID],
    document_id: uuid.UUID,
) -> list[uuid.UUID]:
    """Drop recipients who already have a fresh validation_failed
    notification for this document — guards against rule-misconfig storms."""
    user_ids = list(user_ids)
    if not user_ids:
        return []
    cutoff = datetime.now(timezone.utc) - NOTIFICATION_DEDUPE_WINDOW
    rows = await db.execute(
        select(Notification.user_id).where(
            and_(
                Notification.user_id.in_(user_ids),
                Notification.document_id == document_id,
                Notification.type == NOTIFICATION_TYPE,
                Notification.created_at >= cutoff,
            )
        )
    )
    recently_notified = {r[0] for r in rows.all()}
    return [u for u in user_ids if u not in recently_notified]


async def notify_validation_failed(
    db: AsyncSession,
    doc: Document,
    failed_rules: list[RuleResult],
    *,
    actor_id: Optional[uuid.UUID] = None,
) -> int:
    """Notify uploader, dept managers, and active admins. Returns recipient count."""
    recipients: list[uuid.UUID] = [doc.user_id]
    recipients.extend(await managers_of(db, doc.department_id))
    admin_rows = await db.execute(
        select(User.id).where(User.role == "admin", User.is_active.is_(True))
    )
    recipients.extend(r[0] for r in admin_rows.all())

    eligible = await _filter_recent_notified(db, recipients, doc.id)
    if not eligible:
        return 0

    payload = {
        "title": doc.title,
        "failed_count": len(failed_rules),
        "rules": [
            {"name": r.rule_name, "message": r.message}
            for r in failed_rules[:5]
        ],
    }
    await notify_many(
        db,
        user_ids=eligible,
        type_=NOTIFICATION_TYPE,
        document_id=doc.id,
        actor_id=actor_id,
        payload=payload,
    )
    return len(eligible)
