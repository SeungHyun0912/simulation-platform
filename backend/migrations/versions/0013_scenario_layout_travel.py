"""scenario_version.layout_version_id, scenario_version.travel_rule

수동 작성·검토본. 기준: CR-backend-20261030-be20-process-layout-travel(BE-23, 사용자 지시 2026-10-30), ERD §6·§7.
- 시나리오 버전이 배치판(승인본)을 고른다(선택, 같은 프로젝트). 실행 입력에 배치판을 고정하는 근거다.
- travel_rule(JSONB 객체): 이동 속도(km/h, 사람 `person`·운반 자원 종류별)와 운반 상하차 시간(분). 비어 있으면 사용자 기본값
  (속도 4 km/h, 상하차 1분)을 쓰고 사용한 가정으로 보고한다.
- 승인 후 동결: scenario_version_guard()에 두 컬럼을 더한다.

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

GUARD = """
CREATE OR REPLACE FUNCTION scenario_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'only draft scenario versions can be deleted (version %)', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id
       OR NEW.scenario_id <> OLD.scenario_id OR NEW.version_no <> OLD.version_no
       OR NEW.base_version_id IS DISTINCT FROM OLD.base_version_id THEN
        RAISE EXCEPTION 'scenario version identity is immutable (version %)', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status <> OLD.status AND NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
        RAISE EXCEPTION 'illegal scenario version status transition % -> %',
            OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'draft' AND (
           NEW.stopping_rule IS DISTINCT FROM OLD.stopping_rule
        OR NEW.assumption_reason IS DISTINCT FROM OLD.assumption_reason
        OR NEW.notes IS DISTINCT FROM OLD.notes
        {extra}
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
        RAISE EXCEPTION 'scenario version content is immutable unless draft (version %)',
            OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$
"""


def upgrade() -> None:
    op.add_column("scenario_version", sa.Column("layout_version_id", pg.UUID(as_uuid=True)))
    op.add_column("scenario_version", sa.Column("travel_rule", pg.JSONB(), server_default=sa.text("'{}'::jsonb"),
                                                nullable=False))
    op.create_foreign_key("fk_scenario_version_layout", "scenario_version", "layout_version",
                          ["project_id", "layout_version_id"], ["project_id", "id"], ondelete="RESTRICT")
    op.create_check_constraint("ck_scenario_version_travel_rule", "scenario_version",
                               "jsonb_typeof(travel_rule) = 'object'")
    op.execute(GUARD.format(extra="OR NEW.layout_version_id IS DISTINCT FROM OLD.layout_version_id\n"
                                  "        OR NEW.travel_rule IS DISTINCT FROM OLD.travel_rule"))


def downgrade() -> None:
    op.execute(GUARD.format(extra=""))
    op.drop_constraint("ck_scenario_version_travel_rule", "scenario_version", type_="check")
    op.drop_constraint("fk_scenario_version_layout", "scenario_version", type_="foreignkey")
    op.drop_column("scenario_version", "travel_rule")
    op.drop_column("scenario_version", "layout_version_id")
