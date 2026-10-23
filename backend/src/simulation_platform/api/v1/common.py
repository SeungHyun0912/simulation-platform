from simulation_platform.schemas.common import ErrorEnvelope

ERR = {"model": ErrorEnvelope}

# OpenAPI에 문서화할 공통 오류 응답.
READ_ERRORS = {401: ERR, 404: ERR, 422: ERR}
WRITE_ERRORS = {**READ_ERRORS, 403: ERR}
PATCH_ERRORS = {**WRITE_ERRORS, 412: ERR, 428: ERR}
