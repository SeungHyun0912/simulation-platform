from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """liveness 전용. DB/schema 호환을 보는 readiness는 DB 계층 도입 후 추가한다."""
    return {"data": {"status": "ok"}}
