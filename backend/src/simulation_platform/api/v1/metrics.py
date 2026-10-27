from fastapi import APIRouter, Depends

from simulation_platform.api.v1.common import ERR
from simulation_platform.auth.principal import Principal, get_principal
from simulation_platform.schemas.common import ListOut, Page
from simulation_platform.schemas.run import MetricDefinitionOut
from simulation_platform.simulation.metrics import DEFINITION_VERSION, DEFINITIONS

router = APIRouter(tags=["runs"])


@router.get("/metric-definitions", response_model=ListOut[MetricDefinitionOut], responses={401: ERR})
def list_metric_definitions(principal: Principal = Depends(get_principal)):
    """지표 정의(key·단위·차원·설명). 지표 값을 해석하는 기준이며 정의가 바뀌면 `definition_version`이 바뀐다."""
    rows = [{"metric_key": key, "unit": unit, "dimension": dimension, "description": text,
             "definition_version": DEFINITION_VERSION} for key, (unit, dimension, text) in DEFINITIONS.items()]
    return {"data": rows, "page": Page(limit=len(rows), next_cursor=None)}
