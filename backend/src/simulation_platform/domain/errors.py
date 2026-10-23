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
