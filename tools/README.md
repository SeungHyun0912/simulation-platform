# 개발 도구
- check_workspace.py: 외부 의존성 없는 문서·구조·JSON 검증.
- cad/: CAD 추출 코드가 들어갈 자리. 현재 코드 없음.

실행:
```bash
python tools/check_workspace.py
```
검사 범위:
필수 문서, README별 상대 링크 파일 존재, 코드펜스 밖 Markdown 링크,
JSON 구문, 계약 승인 상태와 OpenAPI 경로/hash 정합성,
활성 Markdown의 CJK 한자·일본어 문자 검출.
원본 ZIP 내부, 외부 웹 링크, heading anchor, 실제 API schema 의미는 검증하지 않습니다.
이 검사 통과는 도메인/서비스 테스트 통과가 아닙니다.
