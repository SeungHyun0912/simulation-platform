// 자동 생성 파일입니다. 직접 수정하지 마세요(수정하면 pnpm check:api가 실패합니다).
// 생성 명령: pnpm gen:api   도구: openapi-typescript
// 기준 계약: version 0.2.0, openapi_sha256 da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a
// 승인 scope: project-assets-ports, asset-revisions

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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
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
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
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
        /** ListOut[ProjectOut] */
        ListOut_ProjectOut_: {
            /** Data */
            data: components["schemas"]["ProjectOut"][];
            page: components["schemas"]["Page"];
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
        /** Page */
        Page: {
            /** Limit */
            limit: number;
            /** Next Cursor */
            next_cursor: string | null;
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
        /** Single[AssetOut] */
        Single_AssetOut_: {
            data: components["schemas"]["AssetOut"];
        };
        /** Single[AssetRevisionOut] */
        Single_AssetRevisionOut_: {
            data: components["schemas"]["AssetRevisionOut"];
        };
        /** Single[MeOut] */
        Single_MeOut_: {
            data: components["schemas"]["MeOut"];
        };
        /** Single[ProjectOut] */
        Single_ProjectOut_: {
            data: components["schemas"]["ProjectOut"];
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
}
