> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 10. CAD·배치·이동 경로 개발 기술서

## 1. 현재 확보 자료

이번 작성 환경에서 실제 확인한 첨부:
- DWG 파일 1개: 약93.7MB. 이 문서 작성에서 형상 해석하지 않음.
- ZIP 1개: 722,082bytes.
- ZIP 내부: manifest.json, layers.json, texts.jsonl, inserts.jsonl.
- geometry.jsonl은 **없음**.
- manifest summary: entities_scanned=2,716,433, insert_records=16,338,
  text_records=6,174, entities_skipped_no_layer=15.
- manifest INSUNITS=4, DXF version=AC1021.
- 위 값은 manifest를 읽어 확인. 이번 문서 작업에서 각 설비의 좌표 매칭을 재검증한 것은 아님.

이전 대화에서 생성되었다고 언급된 CAD 분석 보고서·PNG·SVG·로드맵 파일은
현재 파일 저장소에 없어 이번 인계 패키지에 포함하지 않는다.
이전 응답의 문자 좌표 후보를 승인된 설비 위치로 seed하지 않는다.

## 2. 목표

현재 EQ/ST 목록에 대응되는 설비 위치, IN/OUT, 구역/벽/문/통로를 추출·검토.
도면 전체 정보를 DB로 복제하는 것이 아니다.
설비 위치와 다음 공정 방향이 같다는 이유만으로 OUT을 확정하지 않는다.

## 3. 파이프라인

upload → 안전 검사 → 메타데이터/추출 report
→ 원본 geometry 변환 → 후보 검색 → 기존 자산 매핑
→ 사용자 검토 → layout draft → network 검증 → layout 승인 → scenario pin.

원본 파일 checksum/source handle/path를 끝까지 보존.
프로젝트 복사 시 CAD blob 중복 저장은 정책에 따라 가능하나 ACL은 독립.

## 4. 좌표 변환

DXF에는 WCS/OCS 및 블록 내부 좌표 구분이 필요하고,
INSERT에는 기준점·회전·축척·배열 정보가 포함된다. [S17,S20]
변환 순서는 entity OCS → block 좌표 → 중첩 INSERT 변환 → model WCS → 모델 단위 m.
실제 matrix 조합 순서는 작은 테스트 DXF로 검증 후 확정.

- paper/model space 혼합 금지.
- INSERT 삽입점은 설비 중심이 아님.
- 중첩 block/회전/비균일 scale/음수 scale/multi-insert 처리.
- layer0/BYBLOCK 상속 고려.
- 외부참조 누락이면 missing_xref 표시.
- 단위없는 도면은 사용자 입력 전 실제 거리 계산 금지.
- bulge ARC, SPLINE, ELLIPSE 근사에는 tolerance와 원본 보존.
- 해치/프록시/미지원 객체 누락 report.
- ZWMPARTREF 미지원15개를 성공적으로 분석했다고 표시하지 않음.

## 5. geometry 추가 추출 요구

schema:
scope_type, scope_name, entity_type, handle, layer,
coordinate_mode, attributes, geometry, source_file_hash.

LINE/LWPOLYLINE/POLYLINE/ARC/CIRCLE/ELLIPSE/SPLINE/SOLID/TRACE/3DFACE/POINT.
블록을 모두 반복 전개하면 파일 크기 급증할 수 있으므로 definitions+inserts 유지.
일차 추출은 streaming JSONL, 메모리에 전체 객체 list를 만들지 않음.
필터는 레이어만이 아니라 참조 블록 폐포도 고려.
레이어0 형상을 무조건 버리지 않는다.

기존 추출 스크립트는 모든 객체가 layer를 지원한다고 가정하면 오류 발생.
`entity.dxf.is_supported("layer")`로 검사, skip/error를 기록.
이 문서는 extractor 소스 전체를 포함하지 않으며 별도 구현/시험 필요.

## 6. 후보 매핑과 승인

cad_mapping review_status:
candidate / accepted / rejected / needs_site_check.

증거:
label_match, nearby_text, block_name, footprint, manual_confirm.
블록명 일치만으로 매핑 승인 금지.
42개 부품블록이 2세트면84대라고 집계하지 않음.
모델에 미배치 block definition은 설비 배치가 아니다.

이전 대화의 후보:
800/1050/1250 대기 구역, AL/CU 도킹 표기, 추가 “선재 검사대기 도킹”.
이 후보는 현장 확인 전 ST 공간/용량/좌표 확정값이 아니다.
신규 도킹은 자동 ST-023 추가 금지.

## 7. 배치/통로 데이터

layout_version은 공정 버전과 독립.
asset_placement는 footprint, port_placement는 실제 IN/OUT/ACCESS.
zone polygon은 구역, project_group은 조직적 논리 묶음.

network:
- junction/door/port attachment node
- directed segment + length/width/allowed modes
- actual shared passage occupancy는 후속 충돌 모델
- 연결 안 된 endpoint 검증
- 접근 금지 구간/벽 통과 경로 검증

도면에서 통로처럼 보인다고 지게차/AMR 허용을 확정하지 않는다.
물리 통로 모양과 실제 운전 정책은 별도 확인.

## 8. 파일 보안·운영

확장자뿐 아니라 파일 signature 확인.
zip 경로 traversal, 심볼릭 링크, 파일 수/확장 후 총 크기/압축률 제한.
대형 파서는 별도 process/container, wall-time/메모리 제한, 네트워크 off 기본.
외부참조 자동 네트워크 다운로드 금지.
업로드 원본은 immutable, 결과만 새 artifact.
다운로드 URL은 project 권한 검사와 제한된 만료 정책.
CAD parser 실패가 전체 API를 중단시키지 않음.

## 9. 인수 테스트

- 단위 mm/m 및 원점 이동 변환
- TEXT 정렬점과 block base point 구분
- 회전/중첩/배열 INSERT
- 재사용 block 다중 실물 위치
- 좌표 unknown 상태의 승인 차단/현장확인 표시
- 논리 flow 노드 이동이 physical layout을 바꾸지 않음
- 실물 포트 누락 경로를 최단직선으로 자동 보완하지 않음
- 다른 project CAD mapping 참조 거부


---
기술 참조 [Sxx]의 공식 주소와 확인 범위: [99_sources.md](../reference/99_sources.md).
