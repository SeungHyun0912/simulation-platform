"""HTTP/ORM에 의존하지 않는 도메인 오류. 코드 목록은 contracts/04_api_contract.md §2 기준."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ErrorDetail:
    message: str
    severity: str = "error"
    rule_id: str | None = None
    entity_id: str | None = None
    field_path: str | None = None
    resolution: str | None = None


class DomainError(Exception):
    code = "INTERNAL_ERROR"
    status_code = 500

    def __init__(self, message: str, details: list[ErrorDetail] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details: list[ErrorDetail] = details or []


class NotFoundError(DomainError):
    code = "NOT_FOUND"
    status_code = 404


class PreconditionRequiredError(DomainError):
    code = "PRECONDITION_REQUIRED"
    status_code = 428


# 412 응답에 EDIT_CONFLICT를 쓰는 매핑은 계약에 명시돼 있지 않아 CR로 확인 요청한다.
class EditConflictError(DomainError):
    code = "EDIT_CONFLICT"
    status_code = 412


class InvalidUnitError(DomainError):
    code = "INVALID_UNIT"
    status_code = 422


class UnauthenticatedError(DomainError):
    code = "UNAUTHENTICATED"
    status_code = 401


class ForbiddenError(DomainError):
    """프로젝트 존재를 이미 아는 멤버의 역할 부족. 비멤버는 NotFoundError를 쓴다."""

    code = "FORBIDDEN"
    status_code = 403


class ValidationFailed(DomainError):
    code = "VALIDATION_ERROR"
    status_code = 422


class InvalidCursorError(DomainError):
    code = "INVALID_CURSOR"
    status_code = 422


class ProjectCodeConflict(DomainError):
    code = "PROJECT_CODE_CONFLICT"
    status_code = 409


class AssetCodeConflict(DomainError):
    code = "ASSET_CODE_CONFLICT"
    status_code = 409


class ProductCodeConflict(DomainError):
    code = "PRODUCT_CODE_CONFLICT"
    status_code = 409


class MaterialCodeConflict(DomainError):
    code = "MATERIAL_CODE_CONFLICT"
    status_code = 409


class ProcessDraftExistsError(DomainError):
    code = "PROCESS_DRAFT_EXISTS"
    status_code = 409


class ProcessValidationFailed(DomainError):
    """knowledge 검증 오류가 있어 제출·승인할 수 없음. details에 오류 목록."""

    code = "PROCESS_VALIDATION_FAILED"
    status_code = 422


class VersionImmutableError(DomainError):
    """초안이 아닌 버전의 내용을 바꾸려 할 때(승인·검토 중·대체됨)."""

    code = "VERSION_IMMUTABLE"
    status_code = 409


class RevisionDraftExistsError(DomainError):
    code = "REVISION_DRAFT_EXISTS"
    status_code = 409


class ScenarioCodeConflict(DomainError):
    code = "SCENARIO_CODE_CONFLICT"
    status_code = 409


class ScenarioDraftExistsError(DomainError):
    code = "SCENARIO_DRAFT_EXISTS"
    status_code = 409


class ScenarioNotRunnable(DomainError):
    """실행 사전검증 오류가 있어 시나리오 버전을 승인할 수 없음(DEC-007: 승인 = 실행 가능)."""

    code = "SCENARIO_NOT_RUNNABLE"
    status_code = 422


class InvalidStateTransitionError(DomainError):
    code = "INVALID_STATE_TRANSITION"
    status_code = 409
