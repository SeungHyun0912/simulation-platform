// 자동 생성 파일입니다. 직접 수정하지 마세요(수정하면 pnpm check:api가 실패합니다).
// 생성 명령: pnpm gen:api   도구: openapi-typescript
// 기준 계약: version 0.16.1, openapi_sha256 13fa2fb9afce00b5bc9808d57fdfaa4d9b1dff463745beeeecd4504c478842ad
// 승인 scope: project-assets-ports, asset-revisions, products-materials, process-versions, scenario-versions, runs

export interface paths {
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Health
         * @description liveness 전용. DB/schema 호환을 보는 readiness는 DB 계층 도입 후 추가한다.
         */
        get: operations["health_api_v1_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Me
         * @description 인증 사용자와 허용된 조직·프로젝트.
         */
        get: operations["get_me_api_v1_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metric-definitions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Metric Definitions
         * @description 지표 정의(key·단위·차원·설명). 지표 값을 해석하는 기준이며 정의가 바뀌면 `definition_version`이 바뀐다.
         */
        get: operations["list_metric_definitions_api_v1_metric_definitions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Projects
         * @description 호출자가 멤버인 프로젝트 목록(code 오름차순).
         */
        get: operations["list_projects_api_v1_projects_get"];
        put?: never;
        /**
         * Create Project
         * @description 프로젝트 생성(조직 admin). 생성자는 project admin으로 등록된다.
         */
        post: operations["create_project_api_v1_projects_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Project */
        get: operations["get_project_api_v1_projects__project_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Project
         * @description name/description/timezone 수정(project admin). If-Match 필수.
         */
        patch: operations["patch_project_api_v1_projects__project_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/asset-revisions/{revision_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Revision */
        get: operations["get_revision_api_v1_projects__project_id__asset_revisions__revision_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Revision
         * @description 초안 수정. 보낸 필드만 바뀌며 ports는 port_id별로 병합한다. 초안이 아니면 409 VERSION_IMMUTABLE.
         */
        patch: operations["patch_revision_api_v1_projects__project_id__asset_revisions__revision_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/asset-revisions/{revision_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve Revision
         * @description in_review → approved (project admin). 이전 승인본은 superseded가 된다.
         *
         *     미정 값은 경고(issues)일 뿐 승인을 막지 않는다. 실행 가능 여부는 시나리오에서 검증한다.
         */
        post: operations["approve_revision_api_v1_projects__project_id__asset_revisions__revision_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/asset-revisions/{revision_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reject Revision
         * @description in_review → draft (project admin, 사유 필수).
         */
        post: operations["reject_revision_api_v1_projects__project_id__asset_revisions__revision_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/asset-revisions/{revision_id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit Revision
         * @description draft → in_review (검토 요청). 이후 내용은 수정할 수 없다.
         */
        post: operations["submit_revision_api_v1_projects__project_id__asset_revisions__revision_id__submit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Assets */
        get: operations["list_assets_api_v1_projects__project_id__assets_get"];
        put?: never;
        /**
         * Create Asset
         * @description 자산 생성. kind별 상세와 포트(설비 IN/OUT, 공간 ACCESS-01)를 한 트랜잭션으로 만든다.
         */
        post: operations["create_asset_api_v1_projects__project_id__assets_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/assets/{asset_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Asset */
        get: operations["get_asset_api_v1_projects__project_id__assets__asset_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Asset
         * @description 표시 정보·상세 수정. kind와 포트는 변경할 수 없다. If-Match 필수.
         */
        patch: operations["patch_asset_api_v1_projects__project_id__assets__asset_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/assets/{asset_id}/ports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Ports */
        get: operations["get_ports_api_v1_projects__project_id__assets__asset_id__ports_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/assets/{asset_id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Revisions
         * @description 자산의 버전 목록(최신 revision_no부터).
         */
        get: operations["list_revisions_api_v1_projects__project_id__assets__asset_id__revisions_get"];
        put?: never;
        /**
         * Create Revision
         * @description 새 초안 생성. 승인본이 있으면 그 설정을 복사하고, 없으면 용량을 모두 '미정'으로 시작한다.
         *
         *     자산당 열린 버전(draft/in_review)은 하나뿐이다(409 REVISION_DRAFT_EXISTS).
         */
        post: operations["create_revision_api_v1_projects__project_id__assets__asset_id__revisions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/assets/{asset_id}/uses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Asset Uses
         * @description 그 자산을 쓰는 제품·공정 버전·노드: 공간 노드의 저장 공간(`space`)이거나 단계의 후보 설비(`equipment_candidate`).
         */
        get: operations["list_asset_uses_api_v1_projects__project_id__assets__asset_id__uses_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/materials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Materials */
        get: operations["list_materials_api_v1_projects__project_id__materials_get"];
        put?: never;
        /**
         * Create Material
         * @description 재료 정의 생성(admin·editor). default_spec의 모든 필드는 기본이 unknown(0이 아님)이다.
         */
        post: operations["create_material_api_v1_projects__project_id__materials_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/materials/{material_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Material */
        get: operations["get_material_api_v1_projects__project_id__materials__material_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Material
         * @description code·name·form·default_spec·notes 수정. default_spec은 보낸 필드만 교체한다. If-Match 필수.
         */
        patch: operations["patch_material_api_v1_projects__project_id__materials__material_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-graphs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Process Graphs
         * @description 여러 제품의 공정 그래프를 한 번에(제품 코드 순). 기준에 맞는 버전이 없는 제품은 `version: null`로 나온다.
         *     항목마다 ETag가 있어 바로 편집 요청(If-Match)에 쓸 수 있다.
         */
        get: operations["list_process_graphs_api_v1_projects__project_id__process_graphs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Process Version */
        get: operations["get_process_version_api_v1_projects__project_id__process_versions__version_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Process Version
         * @description 원자재 기본 단위·완제품 단위·메모 수정(초안만, 단위는 보낸 필드만 교체). If-Match 필수.
         */
        patch: operations["patch_process_version_api_v1_projects__project_id__process_versions__version_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve Process Version
         * @description in_review → approved (project admin). 이전 승인본은 superseded가 된다. 미정은 경고일 뿐 승인을 막지 않는다.
         */
        post: operations["approve_process_version_api_v1_projects__project_id__process_versions__version_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/diff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Diff Process Version
         * @description 이 버전(after)을 기준 버전(before)과 비교한다. 노드·간선은 node_key·edge_key로 맞춘다(읽기 전용).
         */
        get: operations["diff_process_version_api_v1_projects__project_id__process_versions__version_id__diff_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/editor-state": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Editor State
         * @description 화면 좌표(버전 공용). 저장 전에는 빈 좌표와 row_version 0을 돌려준다. ETag는 이 상태의 row_version이다.
         */
        get: operations["get_editor_state_api_v1_projects__project_id__process_versions__version_id__editor_state_get"];
        /**
         * Put Editor State
         * @description 화면 좌표를 통째로 교체한다. 버전 상태와 무관하게 저장되며(승인본 포함) 공정 버전의 ETag·승인에
         *     영향이 없다. If-Match는 이 상태의 row_version(저장 전 0)이다.
         */
        put: operations["put_editor_state_api_v1_projects__project_id__process_versions__version_id__editor_state_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Graph */
        get: operations["get_graph_api_v1_projects__project_id__process_versions__version_id__graph_get"];
        /**
         * Put Graph
         * @description 그래프 전체를 한 트랜잭션으로 교체한다(초안만). 보내지 않은 노드·간선은 삭제된다.
         *
         *     노드·간선 id는 클라이언트가 만든 UUID다. 검증 오류가 하나라도 있으면 아무것도 저장하지 않는다.
         */
        put: operations["put_graph_api_v1_projects__project_id__process_versions__version_id__graph_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reject Process Version
         * @description in_review → draft (project admin, 사유 필수).
         */
        post: operations["reject_process_version_api_v1_projects__project_id__process_versions__version_id__reject_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/steps/{step_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Step
         * @description 단계 수정(초안만). ETag는 단계가 아니라 **공정 버전**의 row_version이며 보낸 최상위 필드를 통째로 교체한다.
         */
        patch: operations["patch_step_api_v1_projects__project_id__process_versions__version_id__steps__step_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Submit Process Version
         * @description draft → in_review. 구조 오류가 있으면 422 PROCESS_VALIDATION_FAILED. 이후 내용은 수정할 수 없다.
         */
        post: operations["submit_process_version_api_v1_projects__project_id__process_versions__version_id__submit_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/process-versions/{version_id}/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Validate Process Version
         * @description 검증 항목 목록. 오류가 있어도 검증이 정상 수행되면 200이다.
         */
        post: operations["validate_process_version_api_v1_projects__project_id__process_versions__version_id__validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Products */
        get: operations["list_products_api_v1_projects__project_id__products_get"];
        put?: never;
        /**
         * Create Product
         * @description 제품 생성(admin·editor). 제품은 버전이 없는 기준정보이며 공정 정의가 버전을 가진다.
         */
        post: operations["create_product_api_v1_projects__project_id__products_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/products/{product_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Product */
        get: operations["get_product_api_v1_projects__project_id__products__product_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Product
         * @description code·name·specification·notes 수정. If-Match 필수. null은 specification·notes를 지운다.
         */
        patch: operations["patch_product_api_v1_projects__project_id__products__product_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/products/{product_id}/process-versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Process Versions
         * @description 제품의 공정 버전 목록(최신 version_no부터).
         */
        get: operations["list_process_versions_api_v1_projects__project_id__products__product_id__process_versions_get"];
        put?: never;
        /**
         * Create Process Version
         * @description 새 초안. 본문의 `base_version_id`(같은 제품의 모든 상태) 또는 승인본의 그래프를 새 id로 복사하고,
         *     둘 다 없으면 빈 그래프·미정 단위로 시작한다. 본문은 선택이다(없으면 승인본 복사).
         *
         *     제품당 열린 버전(draft/in_review)은 하나뿐이다(409 PROCESS_DRAFT_EXISTS).
         */
        post: operations["create_process_version_api_v1_projects__project_id__products__product_id__process_versions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Runs
         * @description 실행 목록(최근 요청부터).
         */
        get: operations["list_runs_api_v1_projects__project_id__runs_get"];
        put?: never;
        /**
         * Create Run
         * @description 실행을 요청한다(202). 승인된 시나리오 버전만, 사전검증을 통과해야 한다(422 `RUN_NOT_RUNNABLE`).
         *
         *     요청하는 순간 입력 스냅샷·run·job이 한 트랜잭션으로 만들어지고 worker가 가져가 실행한다. `Idempotency-Key`가 필수이며
         *     같은 키·같은 본문이면 기존 run을 돌려주고(200), 같은 키·다른 본문이면 409 `IDEMPOTENCY_CONFLICT`다.
         */
        post: operations["create_run_api_v1_projects__project_id__runs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Run
         * @description 상태·시도·종료 사유와, 끝났다면 공식 결과 요약. 상태는 엔진 종료 상태 그대로다(`completed`와 `stalled`를 구분).
         */
        get: operations["get_run_api_v1_projects__project_id__runs__run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/asset-timeline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Asset Timeline
         * @description 설비마다 구간별 상태 시간 구성(처리·준비·예약·막힘·유휴·가동률). 공정이 후보로 둔 설비 전체를 보여 주며 쓰이지 않은
         *     설비는 `used=false`(전 구간 유휴)다. 설비 코드 순. 공식 결과가 없으면 409 `RUN_RESULT_NOT_AVAILABLE`.
         */
        get: operations["get_asset_timeline_api_v1_projects__project_id__runs__run_id__asset_timeline_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/assets/{asset_id}/states": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Asset States
         * @description 설비 하나의 상태 구간(간트용): 상태·시작·끝·길이와 그때의 작업·단계·제품. 길이 0인 전이는 빼고 마지막 구간은 실행
         *     종료 시각까지. 공식 결과가 없으면 409 `RUN_RESULT_NOT_AVAILABLE`.
         */
        get: operations["list_asset_states_api_v1_projects__project_id__runs__run_id__assets__asset_id__states_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/bottlenecks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Run Bottlenecks
         * @description 병목 요약: 다음 저장 공간 부족·다음 설비의 가동·대기 자재 적체로 **멈춰 있는 곳**을 종류·위치·근거와 함께 순위로
         *     돌려준다. 후보마다 막힘을 하류로 따라가 닿은 근본 원인(`root_cause`·`chain`)과 근본 원인별 묶음(`root_causes`)을 준다.
         *     공식 결과(전체 구간 지표)만 쓰며 없으면 409 `RUN_RESULT_NOT_AVAILABLE`. 한계(`limitations`)를 함께 보여야 한다.
         */
        get: operations["get_run_bottlenecks_api_v1_projects__project_id__runs__run_id__bottlenecks_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel Run
         * @description 취소를 요청한다(202). 시작 전이면 바로 `cancelled`가 되고, 실행 중이면 `cancel_requested_at`만 기록되며 worker가
         *     확인해 멈춘 뒤 `cancelled`가 된다(요청과 실제 취소를 구분). 이미 끝났으면 409 `JOB_CANCEL_TOO_LATE`.
         */
        post: operations["cancel_run_api_v1_projects__project_id__runs__run_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/compare/{other_run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Compare Runs
         * @description 두 실행 비교 요약: 비교 가능 여부·주의, 입력 스냅샷 차이, 제품별 핵심 지표(기준·비교·차이·비율), 양쪽 병목 상위 5개.
         *     `run_id`가 기준, `other_run_id`가 비교 대상이다. 같은 프로젝트여야 하고 둘 다 공식 결과가 있어야 한다.
         */
        get: operations["compare_runs_api_v1_projects__project_id__runs__run_id__compare__other_run_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/compare/{other_run_id}/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Compare Run Metrics
         * @description 지표별 기준값·비교값·차이(비교 − 기준)·비율(비교 ÷ 기준). 공정 버전이 달라도 같은 제품이면 맞춘다(차원의 공정 버전을
         *     제품 id로 바꿈). 한쪽에만 있는 행은 다른 쪽 값이 null이다.
         */
        get: operations["compare_run_metrics_api_v1_projects__project_id__runs__run_id__compare__other_run_id__metrics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Run Events
         * @description 공식 결과(선택된 시도)의 이벤트를 `event_seq` 순서로 돌려준다(cursor). 공식 결과가 아직 없으면 409
         *     `RUN_RESULT_NOT_AVAILABLE`. 하루·주·월 경계의 상태 요약은 `event_type=STATE_SNAPSHOT`으로 모아 본다.
         */
        get: operations["list_run_events_api_v1_projects__project_id__runs__run_id__events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/input": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Run Input
         * @description 실행을 요청한 당시의 입력 스냅샷(불변)과 해시. 과거 실행을 현재 설정이 아니라 이 입력으로 설명해야 한다.
         */
        get: operations["get_run_input_api_v1_projects__project_id__runs__run_id__input_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/items/{item_key}/lineage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Item Lineage
         * @description 작업물의 조상(어디서 왔나)과 후손(무엇이 되었나), 그 작업물을 만들거나 바꾼 작업과 길이 보존 값(잔량·이월·균형).
         */
        get: operations["get_item_lineage_api_v1_projects__project_id__runs__run_id__items__item_key__lineage_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Run Metrics
         * @description 공식 결과(선택된 시도)의 지표를 구간별로 돌려준다. 값은 이벤트로만 계산했고 분모가 0이거나 해당 없으면 null이다.
         *     공식 결과가 아직 없으면 409 `RUN_RESULT_NOT_AVAILABLE`. 차원 필터는 함께 쓸 수 있다(모두 만족하는 행만).
         */
        get: operations["list_run_metrics_api_v1_projects__project_id__runs__run_id__metrics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/runs/{run_id}/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Run Report
         * @description 결과 리포트 묶음: 실행·시나리오·가정, 제품별 핵심 지표와 입력 부족, 병목 상위 10개와 근본 원인, 가동률 상위 설비,
         *     적체 상위 대기 공간, 규칙으로 만든 한국어 요약 문장, 한계. 저장된 값만 읽어 같은 run이면 같은 리포트다(LLM 없음).
         *     공식 결과가 없으면 409 `RUN_RESULT_NOT_AVAILABLE`.
         */
        get: operations["get_run_report_api_v1_projects__project_id__runs__run_id__report_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/scenario-versions/{version_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Scenario Version */
        get: operations["get_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Scenario Version
         * @description 초안 수정(보낸 최상위 필드를 통째로 교체). 참조 오류는 422(SCN-REF-001~004)이고, 실행 가능 여부는 사전검증이
         *     따로 판정한다(미정이 있어도 초안은 저장된다). `products`만 보내면 고정하지 않은 자산을 현재 승인 버전으로 채운다.
         */
        patch: operations["patch_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/scenario-versions/{version_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve Scenario Version
         * @description draft → approved(project admin). 사전검증 오류가 있으면 422 SCENARIO_NOT_RUNNABLE. 승인 후 내용은 바꿀 수 없다.
         */
        post: operations["approve_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/scenario-versions/{version_id}/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refresh Scenario Version
         * @description 초안의 제품별 공정 버전을 그 제품의 **현재 승인본**으로 바꾸고 자산 고정을 맞춘다(도착·가정·순서는 그대로).
         *     본문은 선택: `product_ids`(일부 제품만), `assets`(latest 기본 | keep). 바뀐 내용은 `process_changes`·`asset_changes`로
         *     돌려준다. 승인본은 409 `VERSION_IMMUTABLE`(새 초안을 먼저 만든다).
         */
        post: operations["refresh_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/scenario-versions/{version_id}/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Precheck Scenario Version
         * @description 실행 사전검증(저장하지 않음). 시나리오 수준 검사(SCN-*)와, 제품마다 엔진 컴파일 결과(오류·사용한 가정·
         *     가정으로 면제한 항목)를 번역하지 않고 돌려준다. 오류가 있어도 검증이 정상 수행되면 200이다.
         */
        post: operations["precheck_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/scenarios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Scenarios
         * @description 시나리오 목록(code 순). 각 시나리오의 가장 최근 버전 요약을 함께 준다.
         */
        get: operations["list_scenarios_api_v1_projects__project_id__scenarios_get"];
        put?: never;
        /**
         * Create Scenario
         * @description 시나리오와 첫 초안(version 1, 비어 있음·종료 규칙 drain)을 함께 만든다. 코드 중복은 409 SCENARIO_CODE_CONFLICT.
         */
        post: operations["create_scenario_api_v1_projects__project_id__scenarios_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/projects/{project_id}/scenarios/{scenario_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Scenario */
        get: operations["get_scenario_api_v1_projects__project_id__scenarios__scenario_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Patch Scenario
         * @description 이름·설명 수정. If-Match는 시나리오의 row_version이다(버전 내용과 무관).
         */
        patch: operations["patch_scenario_api_v1_projects__project_id__scenarios__scenario_id__patch"];
        trace?: never;
    };
    "/api/v1/projects/{project_id}/scenarios/{scenario_id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Scenario Versions
         * @description 시나리오 버전 목록(최신 version_no부터).
         */
        get: operations["list_scenario_versions_api_v1_projects__project_id__scenarios__scenario_id__versions_get"];
        put?: never;
        /**
         * Create Scenario Version
         * @description 새 초안. `from_version_id`(같은 시나리오의 모든 상태) 또는 가장 최근 승인 버전의 내용을 복사하고, 둘 다 없으면
         *     빈 초안이다. 시나리오당 초안은 하나뿐이다(409 SCENARIO_DRAFT_EXISTS).
         */
        post: operations["create_scenario_version_api_v1_projects__project_id__scenarios__scenario_id__versions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AllocationRule */
        AllocationRule: {
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "fifo" | "priority" | "first_available";
        };
        /**
         * ArrivalDto
         * @description 지정 시각 도착(시나리오 시작 기준 분). 같은 시각에 count개가 도착한다.
         *
         *     원자재에 길이가 없는 공정(예: 2t·3.3t 원자재)은 `length_m`을 비우고 `weight_kg`만 보낸다(해당 없음 ≠ 0, 0.8.0).
         *     길이와 무게는 서로 환산하지 않으며 둘 중 하나는 있어야 한다.
         */
        ArrivalDto: {
            /**
             * At Min
             * @default 0
             */
            at_min: string;
            /** Count */
            count: number;
            /** Length M */
            length_m?: string | null;
            /** Lot */
            lot?: string | null;
            /** Weight Kg */
            weight_kg?: string | null;
        };
        /**
         * AssetCreate
         * @description 포트는 요청에 없다. 서버가 kind에 맞춰 같은 트랜잭션에서 생성한다.
         */
        AssetCreate: {
            /** Code */
            code: string;
            equipment?: components["schemas"]["EquipmentIn"] | null;
            /** External Ref */
            external_ref?: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "equipment" | "storage" | "dock";
            /** Name */
            name: string;
            /** Notes */
            notes?: string | null;
            /**
             * Sort Order
             * @default 0
             */
            sort_order: number;
            space?: components["schemas"]["SpaceIn"] | null;
        };
        /** AssetOut */
        AssetOut: {
            /** Archived At */
            archived_at: string | null;
            /** Code */
            code: string;
            /** Created At */
            created_at: string;
            current_revision: components["schemas"]["RevisionSummary"] | null;
            equipment: components["schemas"]["EquipmentOut"] | null;
            /** External Ref */
            external_ref: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "equipment" | "storage" | "dock";
            latest_revision: components["schemas"]["RevisionSummary"] | null;
            /** Name */
            name: string;
            /** Notes */
            notes: string | null;
            /** Ports */
            ports: components["schemas"]["PortOut"][];
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Row Version */
            row_version: number;
            /** Sort Order */
            sort_order: number;
            space: components["schemas"]["SpaceOut"] | null;
            /** Updated At */
            updated_at: string | null;
        };
        /**
         * AssetPatch
         * @description kind·포트는 PATCH 대상이 아니다(extra 필드로 422).
         */
        AssetPatch: {
            /** Code */
            code?: string | null;
            equipment?: components["schemas"]["EquipmentPatch"] | null;
            /** External Ref */
            external_ref?: string | null;
            /** Name */
            name?: string | null;
            /** Notes */
            notes?: string | null;
            /** Sort Order */
            sort_order?: number | null;
            space?: components["schemas"]["SpacePatch"] | null;
        };
        /** AssetPinChangeOut */
        AssetPinChangeOut: {
            /** Asset Code */
            asset_code?: string | null;
            /**
             * Asset Id
             * Format: uuid
             */
            asset_id: string;
            /**
             * Change
             * @enum {string}
             */
            change: "pinned" | "updated" | "removed";
            /** From Revision Id */
            from_revision_id?: string | null;
            /** To Revision Id */
            to_revision_id?: string | null;
        };
        /** AssetRevisionOut */
        AssetRevisionOut: {
            /** Approved At */
            approved_at: string | null;
            /** Approved By */
            approved_by: string | null;
            /**
             * Asset Id
             * Format: uuid
             */
            asset_id: string;
            /** Created At */
            created_at: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Issues */
            issues: components["schemas"]["IssueOut"][];
            /** Notes */
            notes: string | null;
            /** Ports */
            ports: components["schemas"]["PortPolicyOut"][];
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Rejected At */
            rejected_at: string | null;
            /** Rejection Reason */
            rejection_reason: string | null;
            /** Revision No */
            revision_no: number;
            /** Row Version */
            row_version: number;
            /** Schema Version */
            schema_version: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "in_review" | "approved" | "superseded";
            storage_capacity: components["schemas"]["Capacity"] | null;
            /** Submitted At */
            submitted_at: string | null;
            /** Submitted By */
            submitted_by: string | null;
            /** Updated At */
            updated_at: string | null;
        };
        /** AssetStateSegmentOut */
        AssetStateSegmentOut: {
            /** Duration Min */
            duration_min: string;
            end: components["schemas"]["MinutesOut"];
            /** Operation Id */
            operation_id?: string | null;
            /** Process Version Id */
            process_version_id?: string | null;
            /** Product Code */
            product_code?: string | null;
            start: components["schemas"]["MinutesOut"];
            /**
             * State
             * @description IDLE·RESERVED·SETUP·PROCESSING·BLOCKED(열린 목록)
             */
            state: string;
            /** Step Key */
            step_key?: string | null;
        };
        /** AssetTimelineBucketOut */
        AssetTimelineBucketOut: {
            /** Blocked Min */
            blocked_min: string;
            end: components["schemas"]["MinutesOut"];
            /**
             * Idle Min
             * @description 구간 길이 − (처리+준비+예약+막힘). 가동 달력이 없어 24시간 기준
             */
            idle_min: string;
            /** Processing Min */
            processing_min: string;
            /** Reserved Min */
            reserved_min: string;
            /** Setup Min */
            setup_min: string;
            start: components["schemas"]["MinutesOut"];
            /**
             * Utilization
             * @description 처리 ÷ 구간 길이(0~1). 구간 길이가 0이면 null
             */
            utilization: string | null;
        };
        /** AssetTimelineOut */
        AssetTimelineOut: {
            /** Asset Code */
            asset_code?: string | null;
            /** Asset Id */
            asset_id: string;
            /** Asset Name */
            asset_name?: string | null;
            /** Buckets */
            buckets: components["schemas"]["AssetTimelineBucketOut"][];
            /**
             * Used
             * @description 이 실행에서 한 번이라도 배정됐는가. false면 후보였지만 쓰이지 않아 전 구간 유휴
             */
            used: boolean;
            /**
             * Uses
             * @description 이 설비를 후보로 가진 제품·단계
             */
            uses: components["schemas"]["simulation_platform__schemas__run__AssetUseOut"][];
        };
        /** AssumptionUseOut */
        AssumptionUseOut: {
            /** Code */
            code: string;
            /** Message */
            message: string;
            /** Node Key */
            node_key?: string | null;
        };
        /**
         * AssumptionsDto
         * @description 공정의 미정을 이 시나리오에서만 해소하는 가정(master 공정은 바뀌지 않는다, ADR-017).
         *
         *     키는 그 공정 버전의 node_key다. 값이 하나라도 있으면 시나리오 버전의 `assumption_reason`이 필요하다.
         */
        AssumptionsDto: {
            /**
             * Carrier Empty Move Minutes
             * @description 운반 자원(지게차·AMR)이 다른 곳에서 일을 받으면 빈 차로 옮겨 가는 시간(분). 운반 단계에 설비 후보가 있으면 필요(0.15.0)
             */
            carrier_empty_move_minutes?: string | null;
            /**
             * Equipment Hold
             * @description 한 작업이 여러 산출을 낼 때 설비 점유 정책(07 §13)
             */
            equipment_hold?: "hold_for_operation" | null;
            /**
             * Manual Transport Minutes
             * @description 수동 운반 단계(node_key)별 이동 시간(분, 0도 명시해야 함)
             */
            manual_transport_minutes?: {
                [key: string]: string;
            };
            /**
             * Out Release
             * @description 다음 공간이 가득 찼을 때, 승인된 자산 버전에 OUT 배출 정책이 없는 설비는 산출을 쥐고 기다린다(0.15.0)
             */
            out_release?: "hold" | null;
            /**
             * Residual Scope
             * @description 잔량 이월 단계(node_key)별 잔량 범위(공정에 미정일 때만)
             */
            residual_scope?: {
                [key: string]: "machine" | "product" | "operation" | "lot";
            };
            /**
             * Unbounded Buffers
             * @description 용량을 모르는 대기 장소를 용량 제한 없이 대기하는 것으로 가정
             * @default false
             */
            unbounded_buffers: boolean;
        };
        /** AttemptOut */
        AttemptOut: {
            /** Attempt No */
            attempt_no: number;
            /** Finished At */
            finished_at: string | null;
            /** Heartbeat At */
            heartbeat_at: string | null;
            /** Started At */
            started_at: string;
            /**
             * State
             * @enum {string}
             */
            state: "running" | "finished" | "failed" | "cancelled" | "abandoned";
            /** Termination Reason */
            termination_reason: string | null;
            /** Worker Id */
            worker_id: string;
        };
        /** BottleneckLocationOut */
        BottleneckLocationOut: {
            /** Node Key */
            node_key?: string | null;
            /** Node Label */
            node_label?: string | null;
            /** Process Version Id */
            process_version_id?: string | null;
            /** Product Code */
            product_code?: string | null;
            /** Product Id */
            product_id?: string | null;
            /** Product Name */
            product_name?: string | null;
            /** Step Key */
            step_key?: string | null;
            /** Step Label */
            step_label?: string | null;
        };
        /** BottleneckOut */
        BottleneckOut: {
            /**
             * Chain
             * @description 이 후보에서 근본 원인까지 막힘이 번진 경로(시작 포함)
             */
            chain?: components["schemas"]["ChainStepOut"][];
            /**
             * Evidence
             * @description 근거 수치(종류마다 다름). 숫자는 decimal 문자열
             */
            evidence: {
                [key: string]: components["schemas"]["JsonValue"];
            };
            /**
             * Explanation
             * @description 한국어 한 줄 설명(수치 포함)
             */
            explanation: string;
            /**
             * Kind
             * @description space_full: 다음 저장 공간 부족으로 멈춤, equipment_busy: 다음 설비의 가동으로 멈춤, queue_pileup: 대기 자재가 쌓임(운반이 1제품씩이라는 기준)
             * @enum {string}
             */
            kind: "space_full" | "equipment_busy" | "queue_pileup";
            /**
             * Level
             * @description 같은 종류 안의 비율(`share`)과 멈춘 양으로 정한 정도(임시 기준값)
             * @enum {string}
             */
            level: "high" | "medium" | "low";
            location: components["schemas"]["BottleneckLocationOut"];
            /**
             * Rank
             * @description 전체 순위(level → 종류 순서 → 멈춘 양)
             */
            rank: number;
            /**
             * Rank In Kind
             * @description 같은 종류 안에서의 순위(멈춘 양 큰 순)
             */
            rank_in_kind: number;
            /** @description 근본 원인. 같은 곳을 다시 지나거나 더 갈 곳이 없으면 판정 불가(null) */
            root_cause?: components["schemas"]["RootCauseOut"] | null;
            /**
             * Share
             * @description 같은 종류의 멈춘 양 합계 대비 비율(0~1)
             */
            share: string;
            /**
             * Stalled Item Min
             * @description 멈춘 양(작업물·분). 종류가 다르면 겹치므로 합산하지 않는다
             */
            stalled_item_min: string;
        };
        /** BottleneckSummaryOut */
        BottleneckSummaryOut: {
            /** Definition Version */
            definition_version: string;
            /** Findings */
            findings: components["schemas"]["BottleneckOut"][];
            /** Headline */
            headline: string;
            /**
             * Limitations
             * @description 이 판정의 한계(가정·모델링하지 않은 것). 화면에 함께 보여야 한다
             */
            limitations: string[];
            /** @description 관측한 가상 시간(실행 종료 시각) */
            observed: components["schemas"]["MinutesOut"];
            /**
             * Quality Status
             * @enum {string}
             */
            quality_status: "complete" | "censored" | "incomplete";
            /**
             * Root Causes
             * @description 근본 원인별로 묶은 후보(CR be17). 화면의 '무엇을 고칠까' 목록
             */
            root_causes?: components["schemas"]["RootCauseGroupOut"][];
            /**
             * Run Id
             * Format: uuid
             */
            run_id: string;
            /**
             * Thresholds
             * @description 판정에 쓴 기준값(임시 휴리스틱)
             */
            thresholds: {
                [key: string]: string;
            };
        };
        /** CandidateDto */
        CandidateDto: {
            /**
             * Asset Id
             * Format: uuid
             */
            asset_id: string;
            /**
             * Eligibility Status
             * @default unknown
             * @enum {string}
             */
            eligibility_status: "confirmed" | "unknown";
        };
        /**
         * Capacity
         * @description 03 §3 용량 계약. finite만 value·unit을 가지며 나머지 mode는 둘 다 null이다.
         *
         *     status는 보내지 않아도 된다(unknown→unknown, 그 외→confirmed로 서버가 채운다).
         *     master 값에는 assumed/not_applicable을 쓸 수 없다(가정은 시나리오에서만).
         */
        Capacity: {
            /**
             * Mode
             * @enum {string}
             */
            mode: "unknown" | "finite" | "unlimited" | "not_allowed";
            /** Status */
            status?: ("unknown" | "confirmed") | null;
            /** Unit */
            unit?: ("item" | "bobbin_slot" | "pallet_slot" | "kg" | "m2") | null;
            /** Value */
            value?: string | null;
        };
        /** ChainStepOut */
        ChainStepOut: {
            /**
             * Key
             * @description 단계면 step_key, 공간이면 node_key
             */
            key: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "step" | "space";
            /** Label */
            label: string;
            /** Process Version Id */
            process_version_id: string;
        };
        /** ComparisonBottlenecksOut */
        ComparisonBottlenecksOut: {
            /** Base */
            base: components["schemas"]["BottleneckOut"][];
            /** Other */
            other: components["schemas"]["BottleneckOut"][];
        };
        /**
         * CompileIssueOut
         * @description 엔진 컴파일 결과를 번역하지 않고 그대로 담는다(rule_id = 엔진 코드 또는 도메인 실행 검증 코드).
         */
        CompileIssueOut: {
            /** Field Path */
            field_path?: string | null;
            /** Message */
            message: string;
            /** Node Key */
            node_key?: string | null;
            /** Rule Id */
            rule_id: string;
        };
        /** CompileProblemOut */
        CompileProblemOut: {
            /** Message */
            message: string;
            /** Node Key */
            node_key?: string | null;
            /** Product Index */
            product_index: number;
            /** Rule Id */
            rule_id: string;
        };
        /**
         * CountMeasure
         * @description 단위 수·가닥 수. known만 값(1 이상 정수, JSON integer)을 가진다.
         */
        CountMeasure: {
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "known" | "not_applicable";
            /** Value */
            value?: number | null;
        };
        /**
         * DecimalMeasure
         * @description 길이(m)·중량(kg). known만 값(0 초과 decimal 문자열, 소수 6자리까지)을 가진다.
         */
        DecimalMeasure: {
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "known" | "not_applicable";
            /** Value */
            value?: string | null;
        };
        /**
         * DefaultSpec
         * @description 길이·중량·단위 수·가닥 수는 서로 환산하지 않는다. 기본값은 모두 unknown(0이 아님).
         */
        DefaultSpec: {
            length_m?: components["schemas"]["DecimalMeasure"];
            strand_count?: components["schemas"]["CountMeasure"];
            unit_count?: components["schemas"]["CountMeasure"];
            weight_kg?: components["schemas"]["DecimalMeasure"];
        };
        /**
         * DefaultSpecPatch
         * @description 보낸 필드만 교체한다.
         */
        DefaultSpecPatch: {
            length_m?: components["schemas"]["DecimalMeasure"] | null;
            strand_count?: components["schemas"]["CountMeasure"] | null;
            unit_count?: components["schemas"]["CountMeasure"] | null;
            weight_kg?: components["schemas"]["DecimalMeasure"] | null;
        };
        /**
         * DiffField
         * @description 엔티티 안의 JSON Pointer 경로와 before(against)·after(target) 값. 없는 쪽은 null이다.
         */
        DiffField: {
            after: components["schemas"]["JsonValue"];
            before: components["schemas"]["JsonValue"];
            /**
             * Change
             * @enum {string}
             */
            change: "added" | "removed" | "changed";
            /** Field Path */
            field_path: string;
        };
        /** DiffSummary */
        DiffSummary: {
            /** Added */
            added: number;
            /** Changed */
            changed: number;
            /** Identical */
            identical: boolean;
            /** Removed */
            removed: number;
        };
        /** DispatchUnknown */
        DispatchUnknown: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "unknown";
        };
        /**
         * DispatchWhenAvailable
         * @description D-U05: 목적지 설비가 가용하면 이동, 바쁘면 IN에서 대기.
         */
        DispatchWhenAvailable: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "when_destination_available";
            /**
             * Reservation
             * @enum {string}
             */
            reservation: "unknown" | "reserve" | "none";
            /** Wait At In If Busy */
            wait_at_in_if_busy: boolean;
        };
        /**
         * DrainRule
         * @description 모든 작업물이 소진될 때까지(또는 더 진행할 사건이 없을 때까지).
         */
        DrainRule: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "drain";
        };
        /**
         * DurationMeasure
         * @description 시간(분). 준비·대기 시간은 0이 유효한 값이므로 known은 0 이상을 허용한다(처리 시간과 다름).
         */
        DurationMeasure: {
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "known" | "not_applicable";
            /** Value */
            value?: string | null;
        };
        /** EdgeChange */
        EdgeChange: {
            /** Edge Key */
            edge_key: string;
            /** Fields */
            fields: components["schemas"]["DiffField"][];
        };
        /** EdgeDiff */
        EdgeDiff: {
            /** Added */
            added: components["schemas"]["GraphEdge"][];
            /** Changed */
            changed: components["schemas"]["EdgeChange"][];
            /** Removed */
            removed: components["schemas"]["GraphEdge"][];
        };
        /**
         * EditorStateIn
         * @description 화면 좌표 전체 교체. 키는 이 버전의 노드 id여야 한다(노드 수 상한 500과 같다).
         */
        EditorStateIn: {
            /** Node Positions */
            node_positions: {
                [key: string]: components["schemas"]["NodePosition"];
            };
            viewport?: components["schemas"]["Viewport"] | null;
        };
        /** EditorStateOut */
        EditorStateOut: {
            /** Node Positions */
            node_positions: {
                [key: string]: components["schemas"]["NodePosition"];
            };
            /**
             * Process Version Id
             * Format: uuid
             */
            process_version_id: string;
            /**
             * Row Version
             * @description 저장 전에는 0. 공정 버전의 row_version과 별개다.
             */
            row_version: number;
            /** Updated At */
            updated_at: string | null;
            /** Updated By */
            updated_by: string | null;
            viewport: components["schemas"]["Viewport"] | null;
        };
        /** EquipmentIn */
        EquipmentIn: {
            /** Equipment Type */
            equipment_type: string;
            /** Model Name */
            model_name?: string | null;
        };
        /** EquipmentOut */
        EquipmentOut: {
            /** Equipment Type */
            equipment_type: string;
            /** Model Name */
            model_name: string | null;
        };
        /** EquipmentPatch */
        EquipmentPatch: {
            /** Equipment Type */
            equipment_type?: string | null;
            /** Model Name */
            model_name?: string | null;
        };
        /** ErrorBody */
        ErrorBody: {
            /** Code */
            code: string;
            /** Details */
            details: components["schemas"]["ErrorDetailOut"][];
            /** Message */
            message: string;
            /** Request Id */
            request_id: string | null;
        };
        /** ErrorDetailOut */
        ErrorDetailOut: {
            /** Entity Id */
            entity_id?: string | null;
            /** Field Path */
            field_path?: string | null;
            /** Message */
            message: string;
            /** Resolution */
            resolution?: string | null;
            /** Rule Id */
            rule_id?: string | null;
            /**
             * Severity
             * @default error
             */
            severity: string;
        };
        /** ErrorEnvelope */
        ErrorEnvelope: {
            error: components["schemas"]["ErrorBody"];
        };
        /** EventOut */
        EventOut: {
            /** Asset Key */
            asset_key?: string | null;
            /** Destination */
            destination?: string | null;
            /** Event Seq */
            event_seq: number;
            /** Event Type */
            event_type: string;
            /** Item Key */
            item_key?: string | null;
            /** Operation Id */
            operation_id?: string | null;
            /** Process Version Id */
            process_version_id?: string | null;
            /**
             * Quantities
             * @description 양·상태. 길이·무게는 decimal 문자열이며 `STATE_SNAPSHOT`은 상태 요약을 담는다
             */
            quantities?: {
                [key: string]: components["schemas"]["JsonValue"];
            };
            /** Reason */
            reason?: string | null;
            sim_time: components["schemas"]["MinutesOut"];
            /** Source */
            source?: string | null;
            /** Step Key */
            step_key?: string | null;
        };
        /** FailureOut */
        FailureOut: {
            /** Message */
            message?: string | null;
            /** Reason */
            reason: string;
            /** Step Key */
            step_key?: string | null;
        };
        /**
         * FixedHorizonRule
         * @description 고정 지평선 `[0, H)`: H 시각의 사건은 처리하지 않는다(07 §11).
         */
        FixedHorizonRule: {
            /** Horizon Min */
            horizon_min: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "fixed_horizon";
        };
        /** GraphEdge */
        GraphEdge: {
            /** Edge Key */
            edge_key: string;
            /**
             * Edge Kind
             * @default material
             * @enum {string}
             */
            edge_kind: "material" | "precedence" | "supply";
            /**
             * From Node Id
             * Format: uuid
             */
            from_node_id: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            movement_rule?: components["schemas"]["MovementRule"];
            /**
             * Source Output Spec Key
             * @description from 노드(operation) 단계의 output spec_key. precedence 간선에는 쓸 수 없다.
             */
            source_output_spec_key?: string | null;
            /**
             * Target Input Spec Key
             * @description to 노드(operation) 단계의 input spec_key. precedence 간선에는 쓸 수 없다.
             */
            target_input_spec_key?: string | null;
            /**
             * To Node Id
             * Format: uuid
             */
            to_node_id: string;
        };
        /**
         * GraphIn
         * @description 그래프 전체 교체(PUT). 보내지 않은 노드·간선은 삭제된다. 간선이 없는 노드를 가리키면 422.
         */
        GraphIn: {
            /**
             * Completion Node Id
             * @description 완제품으로 판정하는 milestone 노드 id(같은 요청의 노드). null=미정
             */
            completion_node_id?: string | null;
            /** Edges */
            edges?: components["schemas"]["GraphEdge"][];
            /** Nodes */
            nodes: components["schemas"]["GraphNode"][];
        };
        /** GraphNode */
        GraphNode: {
            /** Asset Id */
            asset_id?: string | null;
            /**
             * Display Order
             * @default 0
             */
            display_order: number;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "source" | "buffer" | "operation" | "join" | "milestone" | "sink";
            /** Label */
            label: string;
            /** Node Key */
            node_key: string;
            step?: components["schemas"]["StepDto"] | null;
        };
        /** GraphOut */
        GraphOut: {
            /** Completion Node Id */
            completion_node_id: string | null;
            /** Edges */
            edges: components["schemas"]["GraphEdge"][];
            /** Issues */
            issues: components["schemas"]["IssueDto"][];
            /** Nodes */
            nodes: components["schemas"]["GraphNode"][];
            /**
             * Process Version Id
             * Format: uuid
             */
            process_version_id: string;
            /** Row Version */
            row_version: number;
        };
        /** GraphSummaryEdge */
        GraphSummaryEdge: {
            /** Edge Key */
            edge_key: string;
            /** Edge Kind */
            edge_kind: string;
            /**
             * From Node Id
             * Format: uuid
             */
            from_node_id: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * To Node Id
             * Format: uuid
             */
            to_node_id: string;
        };
        /** GraphSummaryNode */
        GraphSummaryNode: {
            /**
             * Asset Id
             * @description 공간 노드의 저장 공간 자산
             */
            asset_id?: string | null;
            /**
             * Candidate Asset Ids
             * @description 단계 노드의 후보 설비
             */
            candidate_asset_ids?: string[];
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Kind */
            kind: string;
            /** Label */
            label: string;
            /** Node Key */
            node_key: string;
            /**
             * Operation Type
             * @description 단계 노드의 처리 방식(handler)
             */
            operation_type?: string | null;
        };
        /** GraphSummaryOut */
        GraphSummaryOut: {
            /** Completion Node Id */
            completion_node_id?: string | null;
            /** Edges */
            edges: components["schemas"]["GraphSummaryEdge"][];
            /** Nodes */
            nodes: components["schemas"]["GraphSummaryNode"][];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HandoffRule */
        HandoffRule: {
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "per_output_unit" | "total_batch";
        };
        /** InputChangeOut */
        InputChangeOut: {
            base?: components["schemas"]["JsonValue"];
            /** Note */
            note?: string | null;
            other?: components["schemas"]["JsonValue"];
            /**
             * Path
             * @description 바뀐 입력의 위치(예: `products.P04.arrivals`, `assets.{asset_id}`, `seed`)
             */
            path: string;
        };
        /** InputRule */
        InputRule: {
            /**
             * Acquire Scope
             * @default unknown
             * @enum {string}
             */
            acquire_scope: "unknown" | "per_operation" | "per_lot";
            /**
             * Consume Policy
             * @default unknown
             * @enum {string}
             */
            consume_policy: "unknown" | "reserve" | "consume" | "transfer";
        };
        /**
         * IssueDto
         * @description 검증 항목. 대상은 entity_id(노드·단계·간선·버전 id) + 그 엔티티 내부 JSON Pointer다.
         */
        IssueDto: {
            /**
             * Entity Id
             * Format: uuid
             */
            entity_id: string;
            /** Field Path */
            field_path: string;
            /** Message */
            message: string;
            /** Resolution */
            resolution?: string | null;
            /** Rule Id */
            rule_id: string;
            /**
             * Severity
             * @enum {string}
             */
            severity: "error" | "warning";
        };
        /**
         * IssueOut
         * @description 검증 항목. 오류 envelope의 details와 같은 필드 구성이다.
         */
        IssueOut: {
            /**
             * Entity Id
             * Format: uuid
             */
            entity_id: string;
            /** Field Path */
            field_path: string;
            /** Message */
            message: string;
            /** Resolution */
            resolution?: string | null;
            /** Rule Id */
            rule_id: string;
            /**
             * Severity
             * @enum {string}
             */
            severity: "error" | "warning";
        };
        JsonValue: unknown;
        /** LineageLinkOut */
        LineageLinkOut: {
            /**
             * Child Key
             * @description 자식이 없으면(전부 잔량·폐기) null
             */
            child_key?: string | null;
            /** Child Length M */
            child_length_m?: string | null;
            /** Parent Key */
            parent_key: string;
            /** Parent Length M */
            parent_length_m?: string | null;
        };
        /** LineageOperationOut */
        LineageOperationOut: {
            /**
             * Accounting Mode
             * @description `abstract_yield`는 물량 보존 검증 대상이 아니다(03 §5)
             * @enum {string}
             */
            accounting_mode: "physical" | "abstract_yield";
            /**
             * Balanced
             * @description 자식 길이 합 + 잔량 = 부모 길이. 검증 대상이 아니면 null
             */
            balanced?: boolean | null;
            /**
             * Carried In M
             * @description 이 작업이 잔량 풀에서 이어 받은 길이
             */
            carried_in_m?: string | null;
            /** Links */
            links: components["schemas"]["LineageLinkOut"][];
            /** Operation Key */
            operation_key: string;
            /** Process Version Id */
            process_version_id?: string | null;
            /**
             * Relation Type
             * @enum {string}
             */
            relation_type: "split" | "transform" | "supply" | "yield";
            /**
             * Residual Length M
             * @description 이 작업이 남긴 잔량(작업 단위 값)
             */
            residual_length_m?: string | null;
            /** Step Key */
            step_key: string;
        };
        /** LineageOut */
        LineageOut: {
            /** Item Key */
            item_key: string;
            /**
             * Items
             * @description 계보에 나온 작업물(조상·후손 전부)
             */
            items: components["schemas"]["WorkItemOut"][];
            /**
             * Operations
             * @description 그 작업물을 만들거나 바꾼 작업, 이벤트 순서
             */
            operations: components["schemas"]["LineageOperationOut"][];
            /**
             * Truncated
             * @description 작업물이 너무 많아 일부만 담았다
             * @default false
             */
            truncated: boolean;
        };
        /** ListOut[AssetOut] */
        ListOut_AssetOut_: {
            /** Data */
            data: components["schemas"]["AssetOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[AssetRevisionOut] */
        ListOut_AssetRevisionOut_: {
            /** Data */
            data: components["schemas"]["AssetRevisionOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[AssetStateSegmentOut] */
        ListOut_AssetStateSegmentOut_: {
            /** Data */
            data: components["schemas"]["AssetStateSegmentOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[AssetTimelineOut] */
        ListOut_AssetTimelineOut_: {
            /** Data */
            data: components["schemas"]["AssetTimelineOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[AssetUseOut] */
        ListOut_AssetUseOut_: {
            /** Data */
            data: components["schemas"]["simulation_platform__schemas__process__AssetUseOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[EventOut] */
        ListOut_EventOut_: {
            /** Data */
            data: components["schemas"]["EventOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[MaterialOut] */
        ListOut_MaterialOut_: {
            /** Data */
            data: components["schemas"]["MaterialOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[MetricComparisonOut] */
        ListOut_MetricComparisonOut_: {
            /** Data */
            data: components["schemas"]["MetricComparisonOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[MetricDefinitionOut] */
        ListOut_MetricDefinitionOut_: {
            /** Data */
            data: components["schemas"]["MetricDefinitionOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[MetricOut] */
        ListOut_MetricOut_: {
            /** Data */
            data: components["schemas"]["MetricOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[ProcessGraphItem] */
        ListOut_ProcessGraphItem_: {
            /** Data */
            data: components["schemas"]["ProcessGraphItem"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[ProcessVersionListItem] */
        ListOut_ProcessVersionListItem_: {
            /** Data */
            data: components["schemas"]["ProcessVersionListItem"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[ProductOut] */
        ListOut_ProductOut_: {
            /** Data */
            data: components["schemas"]["ProductOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[ProjectOut] */
        ListOut_ProjectOut_: {
            /** Data */
            data: components["schemas"]["ProjectOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[RunListItem] */
        ListOut_RunListItem_: {
            /** Data */
            data: components["schemas"]["RunListItem"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[ScenarioOut] */
        ListOut_ScenarioOut_: {
            /** Data */
            data: components["schemas"]["ScenarioOut"][];
            page: components["schemas"]["Page"];
        };
        /** ListOut[ScenarioVersionListItem] */
        ListOut_ScenarioVersionListItem_: {
            /** Data */
            data: components["schemas"]["ScenarioVersionListItem"][];
            page: components["schemas"]["Page"];
        };
        /** MaterialCreate */
        MaterialCreate: {
            /** Code */
            code: string;
            default_spec?: components["schemas"]["DefaultSpec"];
            /** Form */
            form: string;
            /** Name */
            name: string;
            /** Notes */
            notes?: string | null;
        };
        /** MaterialOut */
        MaterialOut: {
            /** Archived At */
            archived_at: string | null;
            /** Code */
            code: string;
            /** Created At */
            created_at: string;
            default_spec: components["schemas"]["DefaultSpec"];
            /** Form */
            form: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Notes */
            notes: string | null;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Row Version */
            row_version: number;
            /** Updated At */
            updated_at: string | null;
        };
        /** MaterialPatch */
        MaterialPatch: {
            /** Code */
            code?: string | null;
            default_spec?: components["schemas"]["DefaultSpecPatch"] | null;
            /** Form */
            form?: string | null;
            /** Name */
            name?: string | null;
            /** Notes */
            notes?: string | null;
        };
        /**
         * MaterialSpecDto
         * @description operation 단계의 입력·출력 재료 spec(CR be06). 길이·중량·단위 수·가닥 수는 서로 환산하지 않는 별개 값이며
         *     재료 `default_spec`과 같은 값 객체다(기본 unknown). spec_key는 단계 안에서 입력·출력 공통으로 유일하다.
         */
        MaterialSpecDto: {
            /**
             * Direction
             * @enum {string}
             */
            direction: "input" | "output";
            /** Form */
            form?: string | null;
            length_m?: components["schemas"]["DecimalMeasure"];
            /** Material Definition Id */
            material_definition_id?: string | null;
            /**
             * Quantity Basis
             * @default unknown
             * @enum {string}
             */
            quantity_basis: "unknown" | "per_operation" | "per_input_unit" | "per_lot" | "total_plan";
            /** Spec Key */
            spec_key: string;
            /** State Code */
            state_code?: string | null;
            strand_count?: components["schemas"]["CountMeasure"];
            unit_count?: components["schemas"]["CountMeasure"];
            weight_kg?: components["schemas"]["DecimalMeasure"];
        };
        /** MeOrganization */
        MeOrganization: {
            /** Code */
            code: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Role */
            role: string;
        };
        /** MeOut */
        MeOut: {
            /** Organizations */
            organizations: components["schemas"]["MeOrganization"][];
            /** Projects */
            projects: components["schemas"]["MeProject"][];
            user: components["schemas"]["MeUser"];
        };
        /** MeProject */
        MeProject: {
            /** Code */
            code: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Role */
            role: string;
            /** Status */
            status: string;
            /** Timezone */
            timezone: string;
        };
        /** MeUser */
        MeUser: {
            /** Display Name */
            display_name: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
        };
        /** MetricComparisonOut */
        MetricComparisonOut: {
            /** Base */
            base?: string | null;
            /** Base Process Version Id */
            base_process_version_id?: string | null;
            /** Delta */
            delta?: string | null;
            /**
             * Dimensions
             * @description 공정 버전 대신 `product_id`(+`product_code`)로 맞춘 차원
             */
            dimensions: {
                [key: string]: string;
            };
            /** Metric Key */
            metric_key: string;
            /** Other */
            other?: string | null;
            /** Other Process Version Id */
            other_process_version_id?: string | null;
            /** Ratio */
            ratio?: string | null;
            /** Unit */
            unit?: string | null;
            window: components["schemas"]["MetricWindowOut"];
        };
        /** MetricDefinitionOut */
        MetricDefinitionOut: {
            /** Definition Version */
            definition_version: string;
            /** Description */
            description: string;
            /**
             * Dimension
             * @description `step`은 공정 버전과 단계를 함께(`process_version_id`+`step_key`) 가리킨다
             * @enum {string}
             */
            dimension: "process_version_id" | "asset_key" | "node_key" | "step";
            /** Metric Key */
            metric_key: string;
            /** Unit */
            unit: string;
        };
        /** MetricOut */
        MetricOut: {
            /** Definition Version */
            definition_version: string;
            /**
             * Dimensions
             * @description 차원: `process_version_id`(공정 버전별) 또는 `asset_key`(설비) 또는 `node_key`(대기 공간)
             */
            dimensions: {
                [key: string]: string;
            };
            /** Metric Key */
            metric_key: string;
            /**
             * Quality Status
             * @description complete: 끝까지 실행, censored: 고정 지평선에서 끊긴 관측, incomplete: 입력 부족·한도 등으로 끝나지 못함
             * @enum {string}
             */
            quality_status: "complete" | "censored" | "incomplete";
            /** Unit */
            unit: string;
            /**
             * Value
             * @description decimal 문자열. 분모가 0이거나 해당 없으면 null(0이 아니다)
             */
            value: string | null;
            window: components["schemas"]["MetricWindowOut"];
        };
        /** MetricPairOut */
        MetricPairOut: {
            /** Base */
            base?: string | null;
            /**
             * Delta
             * @description 비교 − 기준. 한쪽이 없으면 null
             */
            delta?: string | null;
            /** Metric Key */
            metric_key: string;
            /** Other */
            other?: string | null;
            /**
             * Ratio
             * @description 비교 ÷ 기준. 한쪽이 없거나 기준이 0이면 null
             */
            ratio?: string | null;
            /** Unit */
            unit?: string | null;
        };
        /** MetricWindowOut */
        MetricWindowOut: {
            /** @description 마지막 구간은 실행이 끝난 시각까지로 잘린다(관측 시간 = end − start) */
            end: components["schemas"]["MinutesOut"];
            /**
             * Kind
             * @description run: 실행 전체, day: 1,440분, week: 7일, month: 30일(24시간 연속 기준)
             * @enum {string}
             */
            kind: "run" | "day" | "week" | "month";
            start: components["schemas"]["MinutesOut"];
        };
        /** MinutesOut */
        MinutesOut: {
            /**
             * Exact
             * @description 정확한 값(분수 문자열, 예: 100/3)
             */
            exact: string;
            /**
             * Min
             * @description 가상 시간(분), 소수 6자리 decimal 문자열(표시용 반올림)
             */
            min: string;
        };
        /** MovementRule */
        MovementRule: {
            duration_min?: components["schemas"]["DurationMeasure"];
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "manual_duration" | "network_route" | "direct_feed";
        };
        /** NodeChange */
        NodeChange: {
            /** Fields */
            fields: components["schemas"]["DiffField"][];
            /** Node Key */
            node_key: string;
        };
        /** NodeDiff */
        NodeDiff: {
            /** Added */
            added: components["schemas"]["GraphNode"][];
            /** Changed */
            changed: components["schemas"]["NodeChange"][];
            /** Removed */
            removed: components["schemas"]["GraphNode"][];
        };
        /** NodePosition */
        NodePosition: {
            /** X */
            x: number;
            /** Y */
            y: number;
        };
        /**
         * OutputRule
         * @description 길이·중량·단위 수·가닥 수를 섞지 않는다. 총 계획 수량과 작업 한 번의 산출량은 quantity_basis로 구분.
         */
        OutputRule: {
            /**
             * Accounting Mode
             * @default unknown
             * @enum {string}
             */
            accounting_mode: "unknown" | "physical" | "abstract_yield";
            length_m?: components["schemas"]["DecimalMeasure"];
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "configured_units" | "split_length" | "pass_through" | "merge_strands" | "fixed_mass_units";
            /**
             * Quantity Basis
             * @default unknown
             * @enum {string}
             */
            quantity_basis: "unknown" | "per_operation" | "per_input_unit" | "per_lot" | "total_plan";
            /**
             * Schedule
             * @default unknown
             * @enum {string}
             */
            schedule: "unknown" | "sequential_units";
            unit_count?: components["schemas"]["CountMeasure"];
            /** Unit Form */
            unit_form?: string | null;
            weight_kg?: components["schemas"]["DecimalMeasure"];
        };
        /**
         * OutputSpeed
         * @description 선속 기준. basis·output_schedule·parallel_streams가 미정이면 실행 차단(03 §4.1).
         */
        OutputSpeed: {
            /**
             * Basis
             * @default unknown
             * @enum {string}
             */
            basis: "unknown" | "per_stream" | "aggregate_output";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "output_speed";
            /**
             * Output Schedule
             * @default unknown
             * @enum {string}
             */
            output_schedule: "unknown" | "sequential_units" | "parallel_streams";
            parallel_streams?: components["schemas"]["CountMeasure"];
            speed_m_per_min?: components["schemas"]["DecimalMeasure"];
        };
        /** Page */
        Page: {
            /** Limit */
            limit: number;
            /** Next Cursor */
            next_cursor: string | null;
        };
        /** PerOutputUnit */
        PerOutputUnit: {
            duration_min?: components["schemas"]["DecimalMeasure"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "per_output_unit";
            /**
             * Output Schedule
             * @default unknown
             * @enum {string}
             */
            output_schedule: "unknown" | "sequential_units" | "parallel_streams";
        };
        /**
         * PerReferenceLength
         * @description 기준 길이당 시간. scaling=linear를 확인하기 전에는 다른 길이로 비례 계산하지 않는다.
         */
        PerReferenceLength: {
            duration_min?: components["schemas"]["DecimalMeasure"];
            /**
             * Includes Setup
             * @default unknown
             * @enum {string}
             */
            includes_setup: "unknown" | "yes" | "no";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "per_reference_length";
            reference_length_m?: components["schemas"]["DecimalMeasure"];
            /**
             * Scaling
             * @default unknown
             * @enum {string}
             */
            scaling: "unknown" | "linear";
        };
        /** PortOut */
        PortOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Label */
            label: string;
            /** Port Key */
            port_key: string;
            /**
             * Role
             * @enum {string}
             */
            role: "IN" | "OUT" | "ACCESS";
        };
        /** PortPolicyOut */
        PortPolicyOut: {
            buffer_capacity: components["schemas"]["Capacity"];
            /** Dispatch Rule */
            dispatch_rule: components["schemas"]["DispatchUnknown"] | components["schemas"]["DispatchWhenAvailable"];
            /**
             * Port Id
             * Format: uuid
             */
            port_id: string;
            /** Port Key */
            port_key: string;
            /** Release Rule */
            release_rule: components["schemas"]["ReleaseUnknown"] | components["schemas"]["ReleaseWhenAccepts"];
            /**
             * Role
             * @enum {string}
             */
            role: "IN" | "OUT";
        };
        /** PortPolicyPatch */
        PortPolicyPatch: {
            buffer_capacity?: components["schemas"]["Capacity"] | null;
            /** Dispatch Rule */
            dispatch_rule?: (components["schemas"]["DispatchUnknown"] | components["schemas"]["DispatchWhenAvailable"]) | null;
            /**
             * Port Id
             * Format: uuid
             */
            port_id: string;
            /** Release Rule */
            release_rule?: (components["schemas"]["ReleaseUnknown"] | components["schemas"]["ReleaseWhenAccepts"]) | null;
        };
        /** PrecheckIssue */
        PrecheckIssue: {
            /** Field Path */
            field_path?: string | null;
            /** Message */
            message: string;
            /** Rule Id */
            rule_id: string;
            /**
             * Severity
             * @enum {string}
             */
            severity: "error" | "warning";
        };
        /** PrecheckOut */
        PrecheckOut: {
            /** Engine Version */
            engine_version: string;
            /** Error Count */
            error_count: number;
            /** Issues */
            issues: components["schemas"]["PrecheckIssue"][];
            /** Products */
            products: components["schemas"]["ProductPrecheck"][];
            /** Runnable */
            runnable: boolean;
            /**
             * Scenario Version Id
             * Format: uuid
             */
            scenario_version_id: string;
            /** Warning Count */
            warning_count: number;
        };
        /**
         * PreconditionDelay
         * @description 공급 대기(예: AL 싱글-12의 120분). 설비 점유 여부(occupancy)는 미정일 수 있다.
         */
        PreconditionDelay: {
            duration_min?: components["schemas"]["DurationMeasure"];
            /**
             * Occupancy
             * @default unknown
             * @enum {string}
             */
            occupancy: "unknown" | "occupies_machine" | "releases_machine";
            /**
             * Trigger
             * @default unknown
             * @enum {string}
             */
            trigger: "unknown" | "not_applicable" | "per_operation" | "per_input_replacement" | "per_output_replacement" | "on_product_change" | "on_shift_start" | "once_per_run";
        };
        /** ProcessChangeOut */
        ProcessChangeOut: {
            /**
             * From Process Version Id
             * Format: uuid
             */
            from_process_version_id: string;
            /** From Version No */
            from_version_no?: number | null;
            /** Product Code */
            product_code?: string | null;
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "changed" | "unchanged" | "no_approved_version" | "not_requested";
            /**
             * To Process Version Id
             * Format: uuid
             */
            to_process_version_id: string;
            /** To Version No */
            to_version_no?: number | null;
        };
        /** ProcessGraphItem */
        ProcessGraphItem: {
            /**
             * Etag
             * @description 그 공정 버전의 ETag(row_version). 그래프 PUT·단계 PATCH의 If-Match
             */
            etag?: string | null;
            /** @description mode=full일 때 그래프 전체(단건 조회와 같은 모양) */
            graph?: components["schemas"]["GraphOut"] | null;
            /** Product Code */
            product_code: string;
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /** Product Name */
            product_name: string;
            /** @description mode=summary일 때 노드·간선 요약 */
            summary?: components["schemas"]["GraphSummaryOut"] | null;
            /** @description 기준에 맞는 공정 버전이 없으면 null(그래프도 없음) */
            version: components["schemas"]["ProcessVersionSummary"] | null;
        };
        /**
         * ProcessVersionCreate
         * @description 새 초안 생성 본문(선택). 생략·null이면 현재 승인본을 복사한다(0.4.0 동작).
         */
        ProcessVersionCreate: {
            /**
             * Base Version Id
             * @description 복사할 같은 제품의 공정 버전(모든 상태 가능). 복사본은 항상 draft.
             */
            base_version_id?: string | null;
        };
        /** ProcessVersionListItem */
        ProcessVersionListItem: {
            /** Approved At */
            approved_at: string | null;
            /** Base Version Id */
            base_version_id: string | null;
            /** Created At */
            created_at: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Row Version */
            row_version: number;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "in_review" | "approved" | "superseded";
            /** Submitted At */
            submitted_at: string | null;
            /** Updated At */
            updated_at: string | null;
            /** Version No */
            version_no: number;
        };
        /** ProcessVersionOut */
        ProcessVersionOut: {
            /** Approved At */
            approved_at: string | null;
            /** Approved By */
            approved_by: string | null;
            /** Base Version Id */
            base_version_id: string | null;
            /** Completion Node Id */
            completion_node_id: string | null;
            /** Created At */
            created_at: string;
            finished_unit_spec: components["schemas"]["DefaultSpec"];
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Issues */
            issues: components["schemas"]["IssueDto"][];
            /** Notes */
            notes: string | null;
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            raw_unit_spec: components["schemas"]["DefaultSpec"];
            /** Rejected At */
            rejected_at: string | null;
            /** Rejection Reason */
            rejection_reason: string | null;
            /** Row Version */
            row_version: number;
            /** Schema Version */
            schema_version: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "in_review" | "approved" | "superseded";
            /** Submitted At */
            submitted_at: string | null;
            /** Submitted By */
            submitted_by: string | null;
            /** Updated At */
            updated_at: string | null;
            /** Version No */
            version_no: number;
        };
        /**
         * ProcessVersionPatch
         * @description 원자재 기본 단위·완제품 단위·메모(초안만). 단위 값은 보낸 필드만 교체한다.
         */
        ProcessVersionPatch: {
            finished_unit_spec?: components["schemas"]["DefaultSpecPatch"] | null;
            /** Notes */
            notes?: string | null;
            raw_unit_spec?: components["schemas"]["DefaultSpecPatch"] | null;
        };
        /**
         * ProcessVersionSummary
         * @description 제품 응답에 붙는 공정 버전 요약(자산의 RevisionSummary와 같은 방식).
         */
        ProcessVersionSummary: {
            /** Approved At */
            approved_at: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "in_review" | "approved" | "superseded";
            /** Version No */
            version_no: number;
        };
        /** ProcessingNone */
        ProcessingNone: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "none";
        };
        /** ProcessingUnknown */
        ProcessingUnknown: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "unknown";
        };
        /** ProductComparisonOut */
        ProductComparisonOut: {
            base_last_completion?: components["schemas"]["MinutesOut"] | null;
            /** Base Process Version Id */
            base_process_version_id: string;
            /** Metrics */
            metrics: components["schemas"]["MetricPairOut"][];
            other_last_completion?: components["schemas"]["MinutesOut"] | null;
            /** Other Process Version Id */
            other_process_version_id: string;
            /** Product Code */
            product_code?: string | null;
            /** Product Id */
            product_id: string;
            /** Product Name */
            product_name?: string | null;
        };
        /** ProductCreate */
        ProductCreate: {
            /** Code */
            code: string;
            /** Name */
            name: string;
            /** Notes */
            notes?: string | null;
            /** Specification */
            specification?: string | null;
        };
        /** ProductOut */
        ProductOut: {
            /** Archived At */
            archived_at: string | null;
            /** Code */
            code: string;
            /** Created At */
            created_at: string;
            current_process_version?: components["schemas"]["ProcessVersionSummary"] | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            latest_process_version?: components["schemas"]["ProcessVersionSummary"] | null;
            /** Name */
            name: string;
            /** Notes */
            notes: string | null;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Row Version */
            row_version: number;
            /** Specification */
            specification: string | null;
            /** Updated At */
            updated_at: string | null;
        };
        /** ProductPatch */
        ProductPatch: {
            /** Code */
            code?: string | null;
            /** Name */
            name?: string | null;
            /** Notes */
            notes?: string | null;
            /** Specification */
            specification?: string | null;
        };
        /** ProductPrecheck */
        ProductPrecheck: {
            /** Assumptions Used */
            assumptions_used: components["schemas"]["AssumptionUseOut"][];
            /** Compile Issues */
            compile_issues: components["schemas"]["CompileIssueOut"][];
            /** Compiled */
            compiled: boolean;
            /**
             * Process Version Id
             * Format: uuid
             */
            process_version_id: string;
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /** Waived */
            waived: components["schemas"]["CompileIssueOut"][];
        };
        /** ProductResultOut */
        ProductResultOut: {
            /**
             * Completed Items
             * @description 완제품 milestone에 도달한 작업물 수
             */
            completed_items: number;
            /** Completed Length M */
            completed_length_m: string;
            /**
             * Discarded Length M
             * @description 잔량 폐기 길이 합계(m)
             */
            discarded_length_m: string;
            first_completion?: components["schemas"]["MinutesOut"] | null;
            last_completion?: components["schemas"]["MinutesOut"] | null;
            /** Process Version Id */
            process_version_id: string;
            /**
             * Product Code
             * @description 제품 표시 코드(실행 요청 당시 값, 이전 run은 현재 제품 목록으로 보충)
             */
            product_code?: string | null;
            /** Product Id */
            product_id: string;
            /** Product Name */
            product_name?: string | null;
            /** Reached Sink */
            reached_sink: number;
        };
        /** ProjectCreate */
        ProjectCreate: {
            /** Code */
            code: string;
            /** Description */
            description?: string | null;
            /** Name */
            name: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Timezone */
            timezone: string;
        };
        /** ProjectOut */
        ProjectOut: {
            /** Code */
            code: string;
            /** Created At */
            created_at: string;
            /** Description */
            description: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /**
             * Organization Id
             * Format: uuid
             */
            organization_id: string;
            /** Row Version */
            row_version: number;
            /** Status */
            status: string;
            /** Timezone */
            timezone: string;
            /** Updated At */
            updated_at: string | null;
        };
        /** ProjectPatch */
        ProjectPatch: {
            /** Description */
            description?: string | null;
            /** Name */
            name?: string | null;
            /** Timezone */
            timezone?: string | null;
        };
        /** RejectBody */
        RejectBody: {
            /** Reason */
            reason: string;
        };
        /** ReleaseUnknown */
        ReleaseUnknown: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "unknown";
        };
        /**
         * ReleaseWhenAccepts
         * @description D-U06: 목적지가 받아들일 때 OUT에서 배출.
         */
        ReleaseWhenAccepts: {
            /**
             * Block Machine While Waiting
             * @enum {string}
             */
            block_machine_while_waiting: "unknown" | "yes" | "no";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            mode: "when_destination_accepts";
        };
        /** ReportAssetOut */
        ReportAssetOut: {
            /** Asset Id */
            asset_id: string;
            /** Code */
            code?: string | null;
            /** Name */
            name?: string | null;
            /** Processing Time Min */
            processing_time_min?: string | null;
            /** Utilization */
            utilization?: string | null;
        };
        /** ReportMetricOut */
        ReportMetricOut: {
            /** Metric Key */
            metric_key: string;
            /** Unit */
            unit?: string | null;
            /**
             * Value
             * @description 실행 전체 구간 값. 해당 없으면 null(0이 아니다)
             */
            value?: string | null;
        };
        /** ReportProductOut */
        ReportProductOut: {
            /** Completed Items */
            completed_items: number;
            first_completion?: components["schemas"]["MinutesOut"] | null;
            last_completion?: components["schemas"]["MinutesOut"] | null;
            /**
             * Metrics
             * @description 핵심 지표(완료·처리량·리드타임·재공품·폐기). 제품끼리 합산하지 않는다
             */
            metrics: components["schemas"]["ReportMetricOut"][];
            /** Process Version Id */
            process_version_id: string;
            /** Product Code */
            product_code?: string | null;
            /** Product Id */
            product_id: string;
            /** Product Name */
            product_name?: string | null;
            /**
             * Shortfalls
             * @description 끝난 시점의 입력 부족(어느 단계가 무엇을 기다리는지)
             */
            shortfalls: components["schemas"]["ShortfallOut"][];
        };
        /** ReportRunOut */
        ReportRunOut: {
            /**
             * Censored
             * @default false
             */
            censored: boolean;
            /** Engine Version */
            engine_version: string;
            /**
             * Event Count
             * @default 0
             */
            event_count: number;
            /** Input Hash */
            input_hash: string;
            /** @description 관측한 가상 시간(실행 종료 시각) */
            observed: components["schemas"]["MinutesOut"];
            /**
             * Quality Status
             * @enum {string}
             */
            quality_status: "complete" | "censored" | "incomplete";
            /** Replicate Index */
            replicate_index: number;
            /**
             * Run Id
             * Format: uuid
             */
            run_id: string;
            /** Seed */
            seed: number;
            /**
             * Status
             * @enum {string}
             */
            status: "queued" | "running" | "completed" | "stalled" | "horizon_reached" | "failed" | "limit_reached" | "cancelled";
            /** Termination Reason */
            termination_reason?: string | null;
            /**
             * Wip Items
             * @description 끝난 시점의 미완료 작업물 수(제품 합, 참고값)
             * @default 0
             */
            wip_items: number;
        };
        /** ReportScenarioOut */
        ReportScenarioOut: {
            /** Assumption Reason */
            assumption_reason?: string | null;
            /** Code */
            code?: string | null;
            /** Scenario Id */
            scenario_id?: string | null;
            /** Scenario Version Id */
            scenario_version_id?: string | null;
            stopping_rule?: components["schemas"]["JsonValue"];
            /** Version No */
            version_no?: number | null;
        };
        /** ReportSpaceOut */
        ReportSpaceOut: {
            /** Buffer Item Min */
            buffer_item_min?: string | null;
            /** Buffer Peak Items */
            buffer_peak_items?: string | null;
            /** Buffer Wait Avg Min */
            buffer_wait_avg_min?: string | null;
            /** Node Key */
            node_key: string;
            /** Node Label */
            node_label?: string | null;
            /**
             * Space Wait Item Min
             * @description 공간이 차서 들어가지 못하고 기다린 양
             */
            space_wait_item_min?: string | null;
        };
        /** RequirementDto */
        RequirementDto: {
            allocation_rule?: components["schemas"]["AllocationRule"];
            /** Candidates */
            candidates?: components["schemas"]["CandidateDto"][];
            /**
             * Capacity Mode
             * @default finite
             * @enum {string}
             */
            capacity_mode: "finite" | "unlimited";
            /**
             * Required Count
             * @default 1
             */
            required_count: number;
            /**
             * Resource Kind
             * @default equipment
             * @enum {string}
             */
            resource_kind: "equipment" | "worker";
            /** Role Key */
            role_key: string;
            /**
             * Selection Mode
             * @default one_of
             * @enum {string}
             */
            selection_mode: "one_of" | "all_of";
        };
        /** ResidualOut */
        ResidualOut: {
            /** Disposition */
            disposition: string;
            /** Length M */
            length_m: string;
            /** Pool */
            pool: string;
            /** Process Version Id */
            process_version_id: string;
        };
        /** ResidualRule */
        ResidualRule: {
            /**
             * Mode
             * @default unknown
             * @enum {string}
             */
            mode: "unknown" | "none" | "carry_same_product" | "discard";
            /**
             * On Product Change
             * @default unknown
             * @enum {string}
             */
            on_product_change: "unknown" | "discard" | "carry";
            /**
             * On Run End
             * @default unknown
             * @enum {string}
             */
            on_run_end: "unknown" | "discard" | "carry";
            /**
             * Physical Join Mode
             * @default unknown
             * @enum {string}
             */
            physical_join_mode: "unknown" | "abstract_length_pool";
            /**
             * Scope
             * @default unknown
             * @enum {string}
             */
            scope: "unknown" | "machine" | "product" | "operation" | "lot";
        };
        /**
         * RevisionPatch
         * @description 초안만 수정할 수 있다. 보낸 필드만 바뀌며 ports는 port_id별로 병합한다.
         */
        RevisionPatch: {
            /** Notes */
            notes?: string | null;
            /** Ports */
            ports?: components["schemas"]["PortPolicyPatch"][] | null;
            storage_capacity?: components["schemas"]["Capacity"] | null;
        };
        /**
         * RevisionSummary
         * @description 자산 응답에 붙는 버전 요약.
         */
        RevisionSummary: {
            /** Approved At */
            approved_at: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Revision No */
            revision_no: number;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "in_review" | "approved" | "superseded";
        };
        /** RootCauseAssetOut */
        RootCauseAssetOut: {
            /** Asset Id */
            asset_id: string;
            /** Code */
            code?: string | null;
            /** Name */
            name?: string | null;
            /**
             * Utilization
             * @description 실행 전체 가동률(0~1)
             */
            utilization: string;
        };
        /** RootCauseGroupOut */
        RootCauseGroupOut: {
            /** Assets */
            assets: components["schemas"]["RootCauseAssetOut"][];
            /** Explanation */
            explanation: string;
            /**
             * Finding Ranks
             * @description 묶인 후보의 전체 순위
             */
            finding_ranks: number[];
            /**
             * Findings
             * @description 이 근본 원인으로 이어진 병목 후보 수(전체 후보 기준, limit와 무관)
             */
            findings: number;
            /** Input Wait Item Min */
            input_wait_item_min?: string | null;
            /**
             * Levels
             * @description 묶인 후보의 level별 수(high·medium·low)
             */
            levels: {
                [key: string]: number;
            };
            /** Process Version Id */
            process_version_id: string;
            /** Product Code */
            product_code?: string | null;
            /** Product Id */
            product_id?: string | null;
            /** Product Name */
            product_name?: string | null;
            /**
             * Rank
             * @description 묶인 후보의 가장 높은 level → 묶인 후보 수 → 멈춘 양 순
             */
            rank: number;
            /**
             * Stalled Item Min
             * @description 묶인 후보의 멈춘 양 합(종류가 달라 겹칠 수 있어 참고값)
             */
            stalled_item_min: string;
            /** Step Key */
            step_key: string;
            /** Step Label */
            step_label: string;
            /** Utilization */
            utilization?: string | null;
        };
        /**
         * RootCauseOut
         * @description 막힘을 하류로 따라가 닿은, 막히지 않은 단계(흐름을 제한하는 곳). CR be17.
         */
        RootCauseOut: {
            /**
             * Assets
             * @description 후보 설비(가동률 높은 순, 최대 3개)
             */
            assets: components["schemas"]["RootCauseAssetOut"][];
            /** Explanation */
            explanation: string;
            /**
             * Input Wait Item Min
             * @description 이 단계가 입력을 기다린 양. 가동률이 낮은데 크면 투입 조건이 원인일 수 있다
             */
            input_wait_item_min?: string | null;
            /** Process Version Id */
            process_version_id: string;
            /** Product Code */
            product_code?: string | null;
            /** Step Key */
            step_key: string;
            /** Step Label */
            step_label: string;
            /**
             * Utilization
             * @description 후보 설비 중 가장 높은 가동률. 후보 설비가 없으면 null
             */
            utilization?: string | null;
        };
        /** RunComparisonOut */
        RunComparisonOut: {
            base_end_time?: components["schemas"]["MinutesOut"] | null;
            /**
             * Base Run Id
             * Format: uuid
             */
            base_run_id: string;
            /** Base Status */
            base_status: string;
            /** @description 양쪽 병목 요약 상위 5개 */
            bottlenecks: components["schemas"]["ComparisonBottlenecksOut"];
            /**
             * Comparable
             * @description 엔진 버전이 같아 결과 차이를 입력 차이로 설명할 수 있는가
             */
            comparable: boolean;
            /** Input Changes */
            input_changes: components["schemas"]["InputChangeOut"][];
            other_end_time?: components["schemas"]["MinutesOut"] | null;
            /**
             * Other Run Id
             * Format: uuid
             */
            other_run_id: string;
            /** Other Status */
            other_status: string;
            /**
             * Products
             * @description 두 실행에 모두 있는 제품(제품 id로 맞춤)의 핵심 지표 비교
             */
            products: components["schemas"]["ProductComparisonOut"][];
            /** Warnings */
            warnings: string[];
        };
        /** RunCreate */
        RunCreate: {
            /**
             * Replicate Index
             * @default 0
             */
            replicate_index: number;
            /**
             * Scenario Version Id
             * Format: uuid
             * @description 승인된 시나리오 버전
             */
            scenario_version_id: string;
            /**
             * Seed
             * @default 0
             */
            seed: number;
        };
        /** RunInputOut */
        RunInputOut: {
            /**
             * Hash Verified
             * @description 저장된 스냅샷을 다시 정규화해 해시가 맞는지 확인한 결과
             */
            hash_verified: boolean;
            /**
             * Run Id
             * Format: uuid
             */
            run_id: string;
            /** Schema Version */
            schema_version: string;
            /**
             * Sha256
             * @description 정규화 JSON의 SHA-256(= run.input_hash)
             */
            sha256: string;
            /** Snapshot */
            snapshot: {
                [key: string]: components["schemas"]["JsonValue"];
            };
        };
        /** RunListItem */
        RunListItem: {
            /** Finished At */
            finished_at: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Input Hash */
            input_hash: string;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Replicate Index */
            replicate_index: number;
            /** Requested At */
            requested_at: string;
            /**
             * Scenario Version Id
             * Format: uuid
             */
            scenario_version_id: string;
            /** Seed */
            seed: number;
            /** Started At */
            started_at: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "queued" | "running" | "completed" | "stalled" | "horizon_reached" | "failed" | "limit_reached" | "cancelled";
        };
        /** RunOut */
        RunOut: {
            /** Attempts */
            attempts: components["schemas"]["AttemptOut"][];
            /** Cancel Requested At */
            cancel_requested_at: string | null;
            /** Engine Version */
            engine_version: string;
            /** Finished At */
            finished_at: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Input Hash */
            input_hash: string;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Replicate Index */
            replicate_index: number;
            /** Requested At */
            requested_at: string;
            /**
             * Requested By
             * Format: uuid
             */
            requested_by: string;
            /** @description 공식 결과 시도의 요약. 아직 끝나지 않았거나 취소·인프라 실패면 null */
            result: components["schemas"]["RunResultOut"] | null;
            /**
             * Scenario Version Id
             * Format: uuid
             */
            scenario_version_id: string;
            /** Seed */
            seed: number;
            /** Started At */
            started_at: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "queued" | "running" | "completed" | "stalled" | "horizon_reached" | "failed" | "limit_reached" | "cancelled";
            /** Termination Reason */
            termination_reason: string | null;
        };
        /**
         * RunReportOut
         * @description 한 실행의 결과를 화면·보고서 한 장으로 묶는다. 저장된 결과·지표·스냅샷만 읽어 같은 run이면 같은 내용이다(LLM 없음).
         */
        RunReportOut: {
            /** Assumptions */
            assumptions: components["schemas"]["AssumptionUseOut"][];
            /** @description 병목 요약 상위 10개와 근본 원인 */
            bottlenecks: components["schemas"]["BottleneckSummaryOut"];
            /** Definition Version */
            definition_version: string;
            /** Limitations */
            limitations: string[];
            /**
             * Products
             * @description 실행 입력 순서
             */
            products: components["schemas"]["ReportProductOut"][];
            run: components["schemas"]["ReportRunOut"];
            scenario: components["schemas"]["ReportScenarioOut"];
            /**
             * Summary
             * @description 규칙으로 만든 한국어 요약 문장(순서 고정)
             */
            summary: string[];
            /**
             * Top Assets
             * @description 가동률 상위 설비(최대 10개)
             */
            top_assets: components["schemas"]["ReportAssetOut"][];
            /**
             * Top Spaces
             * @description 적체(작업물·분) 상위 대기 공간(최대 10개)
             */
            top_spaces: components["schemas"]["ReportSpaceOut"][];
        };
        /** RunResultOut */
        RunResultOut: {
            /** Assumptions */
            assumptions?: components["schemas"]["AssumptionUseOut"][];
            /**
             * Censored
             * @description 고정 지평선에서 끊긴 관측 중단
             * @default false
             */
            censored: boolean;
            /** Compile Issues */
            compile_issues?: components["schemas"]["CompileProblemOut"][];
            end_time?: components["schemas"]["MinutesOut"] | null;
            /** Engine Version */
            engine_version: string;
            /**
             * Event Count
             * @default 0
             */
            event_count: number;
            failure?: components["schemas"]["FailureOut"] | null;
            horizon?: components["schemas"]["MinutesOut"] | null;
            /** Products */
            products?: components["schemas"]["ProductResultOut"][];
            /** Reason */
            reason?: string | null;
            /** Residuals */
            residuals?: components["schemas"]["ResidualOut"][];
            /** Seed */
            seed?: number | null;
            /** Shortfalls */
            shortfalls?: components["schemas"]["ShortfallOut"][];
            /**
             * State
             * @enum {string}
             */
            state: "queued" | "running" | "completed" | "stalled" | "horizon_reached" | "failed" | "limit_reached" | "cancelled";
            /**
             * Wip Items
             * @default 0
             */
            wip_items: number;
        };
        /** ScenarioAssetDto */
        ScenarioAssetDto: {
            /**
             * Asset Id
             * Format: uuid
             */
            asset_id: string;
            /**
             * Asset Revision Id
             * Format: uuid
             * @description 그 자산의 승인된(또는 승인 후 대체된) 자산 버전
             */
            asset_revision_id: string;
        };
        /** ScenarioCreate */
        ScenarioCreate: {
            /** Code */
            code: string;
            /** Description */
            description?: string | null;
            /** Name */
            name: string;
        };
        /** ScenarioOut */
        ScenarioOut: {
            /** Code */
            code: string;
            /** Created At */
            created_at: string;
            /** Description */
            description: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            latest_version: components["schemas"]["ScenarioVersionSummary"] | null;
            /** Name */
            name: string;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Row Version */
            row_version: number;
            /** Updated At */
            updated_at: string | null;
        };
        /** ScenarioPatch */
        ScenarioPatch: {
            /** Description */
            description?: string | null;
            /** Name */
            name?: string | null;
        };
        /**
         * ScenarioProductDto
         * @description 제품 하나 = 실행의 공정 하나. 목록 순서가 같은 시각 동순위의 처리 순서다.
         */
        ScenarioProductDto: {
            /** Arrivals */
            arrivals?: components["schemas"]["ArrivalDto"][];
            assumptions?: components["schemas"]["AssumptionsDto"];
            /**
             * Priority
             * @default 1
             */
            priority: number;
            /**
             * Process Version Id
             * Format: uuid
             * @description 그 제품의 승인된(또는 승인 후 대체된) 공정 버전
             */
            process_version_id: string;
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
        };
        /** ScenarioRefreshIn */
        ScenarioRefreshIn: {
            /**
             * Assets
             * @description latest: 쓰는 자산을 현재 승인 버전으로 다시 고정하고 안 쓰는 고정은 뺀다, keep: 기존 고정은 두고 새로 쓰는 자산만 채운다
             * @default latest
             * @enum {string}
             */
            assets: "latest" | "keep";
            /**
             * Product Ids
             * @description 일부 제품만 갱신(생략하면 전부)
             */
            product_ids?: string[] | null;
        };
        /** ScenarioRefreshOut */
        ScenarioRefreshOut: {
            /** Asset Changes */
            asset_changes: components["schemas"]["AssetPinChangeOut"][];
            /** Process Changes */
            process_changes: components["schemas"]["ProcessChangeOut"][];
            version: components["schemas"]["ScenarioVersionOut"];
        };
        /** ScenarioVersionCreate */
        ScenarioVersionCreate: {
            /**
             * From Version Id
             * @description 복사할 같은 시나리오의 버전(모든 상태). 생략하면 가장 최근 승인 버전, 없으면 빈 초안
             */
            from_version_id?: string | null;
        };
        /** ScenarioVersionListItem */
        ScenarioVersionListItem: {
            /** Approved At */
            approved_at: string | null;
            /** Base Version Id */
            base_version_id: string | null;
            /** Created At */
            created_at: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Row Version */
            row_version: number;
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "approved";
            /** Updated At */
            updated_at: string | null;
            /** Version No */
            version_no: number;
        };
        /** ScenarioVersionOut */
        ScenarioVersionOut: {
            /** Approved At */
            approved_at: string | null;
            /** Approved By */
            approved_by: string | null;
            /** Assets */
            assets: components["schemas"]["ScenarioAssetDto"][];
            /** Assumption Reason */
            assumption_reason: string | null;
            /** Base Version Id */
            base_version_id: string | null;
            /** Created At */
            created_at: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Notes */
            notes: string | null;
            /** Products */
            products: components["schemas"]["ScenarioProductDto"][];
            /**
             * Project Id
             * Format: uuid
             */
            project_id: string;
            /** Row Version */
            row_version: number;
            /**
             * Scenario Id
             * Format: uuid
             */
            scenario_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "approved";
            /** Stopping Rule */
            stopping_rule: components["schemas"]["DrainRule"] | components["schemas"]["FixedHorizonRule"];
            /** Updated At */
            updated_at: string | null;
            /** Version No */
            version_no: number;
        };
        /**
         * ScenarioVersionPatch
         * @description 보낸 최상위 필드를 통째로 교체한다(초안만). `products`만 보내고 `assets`를 보내지 않으면, 공정이 참조하는
         *     자산 가운데 아직 고정되지 않은 것을 그 자산의 현재 승인 버전으로 채운다(이미 고정한 것은 그대로).
         */
        ScenarioVersionPatch: {
            /** Assets */
            assets?: components["schemas"]["ScenarioAssetDto"][] | null;
            /** Assumption Reason */
            assumption_reason?: string | null;
            /** Notes */
            notes?: string | null;
            /** Products */
            products?: components["schemas"]["ScenarioProductDto"][] | null;
            /** Stopping Rule */
            stopping_rule?: (components["schemas"]["DrainRule"] | components["schemas"]["FixedHorizonRule"]) | null;
        };
        /** ScenarioVersionSummary */
        ScenarioVersionSummary: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "draft" | "approved";
            /** Version No */
            version_no: number;
        };
        /** Setup */
        Setup: {
            duration_min?: components["schemas"]["DurationMeasure"];
            /**
             * Trigger
             * @default unknown
             * @enum {string}
             */
            trigger: "unknown" | "not_applicable" | "per_operation" | "per_input_replacement" | "per_output_replacement" | "on_product_change" | "on_shift_start" | "once_per_run";
        };
        /**
         * ShortfallOut
         * @description 입력 부족: 어느 단계가 몇 개를 기다리는데 몇 개가 필요한지.
         */
        ShortfallOut: {
            /** Held */
            held: number;
            /** Needed */
            needed: number;
            /** Pool */
            pool: string;
            /** Process Version Id */
            process_version_id: string;
            /** Step */
            step?: string | null;
            /** Waiting */
            waiting: number;
        };
        /** Single[AssetOut] */
        Single_AssetOut_: {
            data: components["schemas"]["AssetOut"];
        };
        /** Single[AssetRevisionOut] */
        Single_AssetRevisionOut_: {
            data: components["schemas"]["AssetRevisionOut"];
        };
        /** Single[BottleneckSummaryOut] */
        Single_BottleneckSummaryOut_: {
            data: components["schemas"]["BottleneckSummaryOut"];
        };
        /** Single[EditorStateOut] */
        Single_EditorStateOut_: {
            data: components["schemas"]["EditorStateOut"];
        };
        /** Single[GraphOut] */
        Single_GraphOut_: {
            data: components["schemas"]["GraphOut"];
        };
        /** Single[LineageOut] */
        Single_LineageOut_: {
            data: components["schemas"]["LineageOut"];
        };
        /** Single[MaterialOut] */
        Single_MaterialOut_: {
            data: components["schemas"]["MaterialOut"];
        };
        /** Single[MeOut] */
        Single_MeOut_: {
            data: components["schemas"]["MeOut"];
        };
        /** Single[PrecheckOut] */
        Single_PrecheckOut_: {
            data: components["schemas"]["PrecheckOut"];
        };
        /** Single[ProcessVersionOut] */
        Single_ProcessVersionOut_: {
            data: components["schemas"]["ProcessVersionOut"];
        };
        /** Single[ProductOut] */
        Single_ProductOut_: {
            data: components["schemas"]["ProductOut"];
        };
        /** Single[ProjectOut] */
        Single_ProjectOut_: {
            data: components["schemas"]["ProjectOut"];
        };
        /** Single[RunComparisonOut] */
        Single_RunComparisonOut_: {
            data: components["schemas"]["RunComparisonOut"];
        };
        /** Single[RunInputOut] */
        Single_RunInputOut_: {
            data: components["schemas"]["RunInputOut"];
        };
        /** Single[RunOut] */
        Single_RunOut_: {
            data: components["schemas"]["RunOut"];
        };
        /** Single[RunReportOut] */
        Single_RunReportOut_: {
            data: components["schemas"]["RunReportOut"];
        };
        /** Single[ScenarioOut] */
        Single_ScenarioOut_: {
            data: components["schemas"]["ScenarioOut"];
        };
        /** Single[ScenarioRefreshOut] */
        Single_ScenarioRefreshOut_: {
            data: components["schemas"]["ScenarioRefreshOut"];
        };
        /** Single[ScenarioVersionOut] */
        Single_ScenarioVersionOut_: {
            data: components["schemas"]["ScenarioVersionOut"];
        };
        /** Single[StepOut] */
        Single_StepOut_: {
            data: components["schemas"]["StepOut"];
        };
        /** Single[ValidationOut] */
        Single_ValidationOut_: {
            data: components["schemas"]["ValidationOut"];
        };
        /** Single[VersionDiffOut] */
        Single_VersionDiffOut_: {
            data: components["schemas"]["VersionDiffOut"];
        };
        /** Single[list[PortOut]] */
        Single_list_PortOut__: {
            /** Data */
            data: components["schemas"]["PortOut"][];
        };
        /** SpaceIn */
        SpaceIn: {
            /** Space Type */
            space_type: string;
        };
        /** SpaceOut */
        SpaceOut: {
            /** Space Type */
            space_type: string;
        };
        /** SpacePatch */
        SpacePatch: {
            /** Space Type */
            space_type?: string | null;
        };
        /** StepDiff */
        StepDiff: {
            /** Changed */
            changed: components["schemas"]["NodeChange"][];
        };
        /**
         * StepDto
         * @description operation 노드의 단계. 단계 id는 노드 id와 같다.
         */
        StepDto: {
            /** Handler Version */
            handler_version?: string | null;
            handoff_rule?: components["schemas"]["HandoffRule"];
            input_rule?: components["schemas"]["InputRule"];
            /** Material Specs */
            material_specs?: components["schemas"]["MaterialSpecDto"][];
            /** Operation Type */
            operation_type?: string | null;
            output_rule?: components["schemas"]["OutputRule"];
            residual_rule?: components["schemas"]["ResidualRule"];
            /** Resources */
            resources?: components["schemas"]["RequirementDto"][];
            timing_rule?: components["schemas"]["TimingRule"];
        };
        /** StepOut */
        StepOut: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Label */
            label: string;
            /** Row Version */
            row_version: number;
            step: components["schemas"]["StepDto"];
        };
        /**
         * StepPatch
         * @description 보낸 최상위 필드를 통째로 교체한다(규칙 객체는 부분 병합하지 않는다).
         */
        StepPatch: {
            /** Handler Version */
            handler_version?: string | null;
            handoff_rule?: components["schemas"]["HandoffRule"] | null;
            input_rule?: components["schemas"]["InputRule"] | null;
            /** Label */
            label?: string | null;
            /** Material Specs */
            material_specs?: components["schemas"]["MaterialSpecDto"][] | null;
            /** Operation Type */
            operation_type?: string | null;
            output_rule?: components["schemas"]["OutputRule"] | null;
            residual_rule?: components["schemas"]["ResidualRule"] | null;
            /** Resources */
            resources?: components["schemas"]["RequirementDto"][] | null;
            timing_rule?: components["schemas"]["TimingRule"] | null;
        };
        /** TimingRule */
        TimingRule: {
            precondition_delay?: components["schemas"]["PreconditionDelay"];
            /** Processing */
            processing?: components["schemas"]["ProcessingUnknown"] | components["schemas"]["ProcessingNone"] | components["schemas"]["OutputSpeed"] | components["schemas"]["PerOutputUnit"] | components["schemas"]["PerReferenceLength"];
            setup?: components["schemas"]["Setup"];
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** ValidationOut */
        ValidationOut: {
            /** Error Count */
            error_count: number;
            /** Issues */
            issues: components["schemas"]["IssueDto"][];
            /**
             * Scope
             * @enum {string}
             */
            scope: "knowledge" | "run_template";
            /** Warning Count */
            warning_count: number;
        };
        /** VersionDiffOut */
        VersionDiffOut: {
            /**
             * Against Version Id
             * Format: uuid
             */
            against_version_id: string;
            edges: components["schemas"]["EdgeDiff"];
            /** Header */
            header: components["schemas"]["DiffField"][];
            nodes: components["schemas"]["NodeDiff"];
            steps: components["schemas"]["StepDiff"];
            summary: components["schemas"]["DiffSummary"];
            /**
             * Target Version Id
             * Format: uuid
             */
            target_version_id: string;
        };
        /** Viewport */
        Viewport: {
            /** X */
            x: number;
            /** Y */
            y: number;
            /** Zoom */
            zoom: number;
        };
        /** WorkItemOut */
        WorkItemOut: {
            created_at: components["schemas"]["MinutesOut"];
            /** Form */
            form?: string | null;
            /** Item Key */
            item_key: string;
            /**
             * Length M
             * @description 없으면 null(해당 없음 ≠ 0)
             */
            length_m?: string | null;
            /** Location Key */
            location_key?: string | null;
            /** Lot Key */
            lot_key?: string | null;
            /** Parent Key */
            parent_key?: string | null;
            /** Process Version Id */
            process_version_id?: string | null;
            /** State Code */
            state_code?: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "active" | "consumed" | "completed";
            /** Weight Kg */
            weight_kg?: string | null;
        };
        /** AssetUseOut */
        simulation_platform__schemas__process__AssetUseOut: {
            /**
             * Node Id
             * Format: uuid
             */
            node_id: string;
            /** Node Key */
            node_key: string;
            /** Node Label */
            node_label: string;
            process_version: components["schemas"]["ProcessVersionSummary"];
            /** Product Code */
            product_code: string;
            /**
             * Product Id
             * Format: uuid
             */
            product_id: string;
            /** Product Name */
            product_name: string;
            /** Role Key */
            role_key?: string | null;
            /**
             * Use
             * @description 공간 노드의 자산이거나, 단계의 후보 설비
             * @enum {string}
             */
            use: "space" | "equipment_candidate";
        };
        /** AssetUseOut */
        simulation_platform__schemas__run__AssetUseOut: {
            /** Process Version Id */
            process_version_id: string;
            /** Product Code */
            product_code?: string | null;
            /** Step Key */
            step_key: string;
            /** Step Label */
            step_label?: string | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health_api_v1_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_me_api_v1_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_MeOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_metric_definitions_api_v1_metric_definitions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_MetricDefinitionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_projects_api_v1_projects_get: {
        parameters: {
            query?: {
                /** @description code/name 부분 일치 */
                q?: string | null;
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_ProjectOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_project_api_v1_projects_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProjectOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_project_api_v1_projects__project_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProjectOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_project_api_v1_projects__project_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProjectPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProjectOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_revision_api_v1_projects__project_id__asset_revisions__revision_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                revision_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetRevisionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_revision_api_v1_projects__project_id__asset_revisions__revision_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                revision_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RevisionPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetRevisionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    approve_revision_api_v1_projects__project_id__asset_revisions__revision_id__approve_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                revision_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetRevisionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    reject_revision_api_v1_projects__project_id__asset_revisions__revision_id__reject_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                revision_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RejectBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetRevisionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    submit_revision_api_v1_projects__project_id__asset_revisions__revision_id__submit_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                revision_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetRevisionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_assets_api_v1_projects__project_id__assets_get: {
        parameters: {
            query?: {
                kind?: ("equipment" | "storage" | "dock") | null;
                /** @description code/name 부분 일치 */
                q?: string | null;
                include_archived?: boolean;
                /** @description sort_order | code | name, 앞에 -를 붙이면 내림차순(기본 sort_order) */
                sort?: string | null;
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_AssetOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_asset_api_v1_projects__project_id__assets_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssetCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_asset_api_v1_projects__project_id__assets__asset_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_asset_api_v1_projects__project_id__assets__asset_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssetPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_ports_api_v1_projects__project_id__assets__asset_id__ports_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_list_PortOut__"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_revisions_api_v1_projects__project_id__assets__asset_id__revisions_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_AssetRevisionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_revision_api_v1_projects__project_id__assets__asset_id__revisions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_AssetRevisionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_asset_uses_api_v1_projects__project_id__assets__asset_id__uses_get: {
        parameters: {
            query?: {
                /** @description 제품마다 볼 공정 버전 기준 */
                basis?: "approved" | "latest";
            };
            header?: never;
            path: {
                project_id: string;
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_AssetUseOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_materials_api_v1_projects__project_id__materials_get: {
        parameters: {
            query?: {
                /** @description code/name 부분 일치 */
                q?: string | null;
                include_archived?: boolean;
                /** @description code | name, 앞에 -를 붙이면 내림차순(기본 code) */
                sort?: string | null;
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_MaterialOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_material_api_v1_projects__project_id__materials_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_MaterialOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_material_api_v1_projects__project_id__materials__material_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                material_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_MaterialOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_material_api_v1_projects__project_id__materials__material_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                material_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MaterialPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_MaterialOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_process_graphs_api_v1_projects__project_id__process_graphs_get: {
        parameters: {
            query?: {
                /** @description approved: 현재 승인본(기본), latest: 가장 최근 버전 */
                basis?: "approved" | "latest";
                /** @description 이 제품들만(반복해서 보낸다) */
                product_id?: string[] | null;
                /** @description 이 공정 버전들(최대 50개, 주면 basis·product_id는 무시) */
                version_id?: string[] | null;
                /** @description summary: 노드·간선 요약(기본), full: 그래프 전체 */
                mode?: "summary" | "full";
                /** @description 한 번에 제품 수(최대 50) */
                limit?: number;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_ProcessGraphItem_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_process_version_api_v1_projects__project_id__process_versions__version_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProcessVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_process_version_api_v1_projects__project_id__process_versions__version_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProcessVersionPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProcessVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    approve_process_version_api_v1_projects__project_id__process_versions__version_id__approve_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProcessVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    diff_process_version_api_v1_projects__project_id__process_versions__version_id__diff_get: {
        parameters: {
            query?: {
                /** @description 비교 기준 버전. 생략하면 이 버전의 base_version_id, 없으면 현재 승인본 */
                against?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_VersionDiffOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_editor_state_api_v1_projects__project_id__process_versions__version_id__editor_state_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_EditorStateOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    put_editor_state_api_v1_projects__project_id__process_versions__version_id__editor_state_put: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EditorStateIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_EditorStateOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_graph_api_v1_projects__project_id__process_versions__version_id__graph_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_GraphOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    put_graph_api_v1_projects__project_id__process_versions__version_id__graph_put: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GraphIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_GraphOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    reject_process_version_api_v1_projects__project_id__process_versions__version_id__reject_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RejectBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProcessVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_step_api_v1_projects__project_id__process_versions__version_id__steps__step_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
                step_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StepPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_StepOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    submit_process_version_api_v1_projects__project_id__process_versions__version_id__submit_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProcessVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    validate_process_version_api_v1_projects__project_id__process_versions__version_id__validate_post: {
        parameters: {
            query?: {
                /** @description knowledge: 승인 가능 여부(구조 오류만 오류), run_template: 실행 가능 여부(필수 미정도 오류) */
                scope?: "knowledge" | "run_template";
            };
            header?: never;
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ValidationOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_products_api_v1_projects__project_id__products_get: {
        parameters: {
            query?: {
                /** @description code/name 부분 일치 */
                q?: string | null;
                include_archived?: boolean;
                /** @description code | name, 앞에 -를 붙이면 내림차순(기본 code) */
                sort?: string | null;
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_ProductOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_product_api_v1_projects__project_id__products_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProductOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_product_api_v1_projects__project_id__products__product_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                product_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProductOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_product_api_v1_projects__project_id__products__product_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                product_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProductPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProductOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_process_versions_api_v1_projects__project_id__products__product_id__process_versions_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                product_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_ProcessVersionListItem_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_process_version_api_v1_projects__project_id__products__product_id__process_versions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                product_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ProcessVersionCreate"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ProcessVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_runs_api_v1_projects__project_id__runs_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
                /** @description 상태 필터 */
                status?: ("queued" | "running" | "completed" | "stalled" | "horizon_reached" | "failed" | "limit_reached" | "cancelled") | null;
                /** @description 시나리오 버전 필터 */
                scenario_version_id?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_RunListItem_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_run_api_v1_projects__project_id__runs_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description 실행 요청마다 클라이언트가 만든 고유 값(1~128자). 같은 키·같은 본문이면 기존 결과를 돌려준다. */
                "idempotency-key"?: string | null;
            };
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_RunOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_run_api_v1_projects__project_id__runs__run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_RunOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_asset_timeline_api_v1_projects__project_id__runs__run_id__asset_timeline_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
                /** @description 구간 종류: day(기본)·week·month·run */
                window?: "run" | "day" | "week" | "month";
                /** @description 설비 하나만 */
                asset_id?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_AssetTimelineOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_asset_states_api_v1_projects__project_id__runs__run_id__assets__asset_id__states_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
                /** @description 이 시각에 걸친 구간부터(가상 시간 분, decimal 문자열) */
                from_min?: string | null;
                /** @description 이 시각 전에 시작한 구간까지 */
                to_min?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                run_id: string;
                asset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_AssetStateSegmentOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_run_bottlenecks_api_v1_projects__project_id__runs__run_id__bottlenecks_get: {
        parameters: {
            query?: {
                /** @description 돌려줄 병목 후보 수(순위순) */
                limit?: number;
            };
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_BottleneckSummaryOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    cancel_run_api_v1_projects__project_id__runs__run_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_RunOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    compare_runs_api_v1_projects__project_id__runs__run_id__compare__other_run_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                run_id: string;
                other_run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_RunComparisonOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    compare_run_metrics_api_v1_projects__project_id__runs__run_id__compare__other_run_id__metrics_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
                /** @description 지표 하나만(일·주·월 구간이면 필수) */
                metric_key?: string | null;
                /** @description 구간 종류: run(기본)·day·week·month */
                window?: "run" | "day" | "week" | "month";
                /** @description 값이 다른 행만(한쪽에만 있는 행 포함) */
                changed_only?: boolean;
            };
            header?: never;
            path: {
                project_id: string;
                run_id: string;
                other_run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_MetricComparisonOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_run_events_api_v1_projects__project_id__runs__run_id__events_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
                /** @description 이벤트 종류(예: `STATE_SNAPSHOT`) */
                event_type?: string | null;
                step_key?: string | null;
                asset_key?: string | null;
                item_key?: string | null;
                /** @description 가상 시간(분) 이상, decimal 문자열 */
                from_min?: string | null;
                /** @description 가상 시간(분) 미만, decimal 문자열 */
                to_min?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_EventOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_run_input_api_v1_projects__project_id__runs__run_id__input_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_RunInputOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_item_lineage_api_v1_projects__project_id__runs__run_id__items__item_key__lineage_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                run_id: string;
                item_key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_LineageOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_run_metrics_api_v1_projects__project_id__runs__run_id__metrics_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
                /** @description 지표 key(`GET /metric-definitions` 참조) */
                metric_key?: string | null;
                /** @description 구간 종류: run(전체, 기본)·day·week·month */
                window?: "run" | "day" | "week" | "month";
                /** @description 공정 버전 차원 필터 */
                process_version_id?: string | null;
                /** @description 설비 차원 필터 */
                asset_key?: string | null;
                /** @description 대기 공간 차원 필터 */
                node_key?: string | null;
                /** @description 단계 차원 필터(공정 버전 필터와 함께 쓰면 한 단계) */
                step_key?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_MetricOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_run_report_api_v1_projects__project_id__runs__run_id__report_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_RunReportOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScenarioVersionPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    approve_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__approve_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    refresh_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__refresh_post: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ScenarioRefreshIn"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioRefreshOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    precheck_scenario_version_api_v1_projects__project_id__scenario_versions__version_id__validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_PrecheckOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_scenarios_api_v1_projects__project_id__scenarios_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_ScenarioOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_scenario_api_v1_projects__project_id__scenarios_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScenarioCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    get_scenario_api_v1_projects__project_id__scenarios__scenario_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    patch_scenario_api_v1_projects__project_id__scenarios__scenario_id__patch: {
        parameters: {
            query?: never;
            header?: {
                /** @description ETag 값. 예: "17" */
                "if-match"?: string | null;
            };
            path: {
                project_id: string;
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScenarioPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Precondition Required */
            428: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    list_scenario_versions_api_v1_projects__project_id__scenarios__scenario_id__versions_get: {
        parameters: {
            query?: {
                /** @description 기본 50, 최대 200 */
                limit?: number | null;
                /** @description 서버가 발급한 불투명 cursor */
                cursor?: string | null;
            };
            header?: never;
            path: {
                project_id: string;
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListOut_ScenarioVersionListItem_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
    create_scenario_version_api_v1_projects__project_id__scenarios__scenario_id__versions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                project_id: string;
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ScenarioVersionCreate"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Single_ScenarioVersionOut_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
            /** @description Unprocessable Entity */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorEnvelope"];
                };
            };
        };
    };
}
