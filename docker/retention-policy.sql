-- TimescaleDB Retention Policy 수동 설정 스크립트
-- 운영 환경에서 마이그레이션과 별도로 정책을 조정할 때 사용
-- Usage: psql $DATABASE_URL -f retention-policy.sql

-- telemetry raw: 90일
SELECT remove_retention_policy('telemetry', if_not_exists => TRUE);
SELECT add_retention_policy('telemetry', INTERVAL '90 days', if_not_exists => TRUE);

-- telemetry 1분 집계: 1년
SELECT remove_retention_policy('telemetry_1min', if_not_exists => TRUE);
SELECT add_retention_policy('telemetry_1min', INTERVAL '1 year', if_not_exists => TRUE);

-- telemetry 1시간 집계: 5년
SELECT remove_retention_policy('telemetry_1hour', if_not_exists => TRUE);
SELECT add_retention_policy('telemetry_1hour', INTERVAL '5 years', if_not_exists => TRUE);

-- 현재 정책 확인
SELECT job_id, hypertable_schema, hypertable_name, config
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_retention';
