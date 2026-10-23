import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from simulation_platform.domain.errors import DomainError
from simulation_platform.models import AuditLog


@contextmanager
def transaction(session: Session, conflicts: dict[str, Callable[[], DomainError]]) -> Iterator[None]:
    """본문을 한 트랜잭션으로 커밋한다. 알려진 유일 제약 위반은 도메인 충돌 오류로 바꾼다.

    지연 제약 트리거(포트 불변식)는 커밋 시점에 평가되므로 commit 오류도 같은 경로로 처리한다.
    """
    try:
        yield
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        diag = getattr(exc.orig, "diag", None)
        factory = conflicts.get(getattr(diag, "constraint_name", None) or "")
        if factory is not None:
            raise factory() from exc
        raise
    except BaseException:
        session.rollback()
        raise


def audit(
    session: Session,
    *,
    organization_id: uuid.UUID,
    project_id: uuid.UUID | None,
    actor_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    request_id: str | None,
) -> None:
    """감사 행 추가. before/after에는 변경된 업무 필드만 담고 비밀값을 넣지 않는다."""
    session.add(
        AuditLog(
            organization_id=organization_id,
            project_id=project_id,
            actor_id=actor_id,
            created_by=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
            request_id=request_id,
        )
    )
