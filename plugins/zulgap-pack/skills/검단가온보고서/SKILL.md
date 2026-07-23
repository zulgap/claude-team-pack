---
name: 검단가온보고서
description: Use when 검단가온치과(가온치과) 월간/월말 성과 보고서 작성 요청 시 — "검단가온 보고서", "가온 월말 보고서", "N월 보고서 만들어줘", 검단가온 마케팅 리포트, 플레이스/검색광고/블로그/홈페이지/AVI 월간 수집. 매월 초(1~5일) 실행 권장.
version: 1.0.0
origin: teampack
---

# 검단가온치과 월간 성과 보고서

## 개요
검단가온치과(줄갭 마케팅 고객) 월간 보고서의 수집→작성→발행 워크플로우. 2026-06 리포트에서 전 구간 자동화 완성 — 사장님 개입은 **네이버 로그인 최대 1회**(세션 만료 시)와 GA4용 Browser MCP 연결뿐.

## 산출물 — Notion 6페이지
DB(data_source): `114efa2f-2c3b-8155-a52a-000b76be5969` (월간 성과 보고서 DB _검단가온치과)

| 페이지 이름 규칙 | 마케팅 채널 속성 |
|---|---|
| 📍 월간 성과 보고서 (네이버플레이스) — N월 | 네이버플레이스 |
| 📈 월간 성과 보고서 (검색광고) — N월 | 네이버검색광고 |
| 📝 월간 성과 보고서 (블로그) — N월 | 블로그 |
| 🏥 N월 홈페이지칼럼 | 홈페이지블로그 |
| 📊 AVI 측정 결과 v3 — 26년 N월 | 추가 인사이트 |
| 📊 월간 종합 성과 보고서 (26년 N월) | 추가 인사이트 |

- 속성 "월" = `26년 N월`. 형식 정본 = 템플릿 KB `339efa2f2c3b81b19f46dc70d6e724c4` — **종합 6-2b "원단위 광고비 원가 관리"(예약당/통화당/유입당) 필수** (26-06 신설).
- 증감 표기: 수치+% 병기(`-194 (-13%) 📉`), 추정치는 "(추정)" 명시. GSC 제외 정책.

## 사전 준비 (PC 최초 1회 — 직원 PC 포함)
- **Playwright**: 임의 폴더(예: `문서\playwright-env`)에서 `npm i playwright` → `npx playwright install chromium`. 스크립트는 **그 폴더에서 실행**하거나 `PLAYWRIGHT_DIR` 환경변수로 폴더 지정. (사장님 PC는 `C:/Users/admin/Documents/marketing-report`가 자동 인식됨 — 준비 불필요)
- **네이버 계정**: 검단가온치과 관리 권한이 있는 네이버 계정. 첫 실행 시 로그인 창 1회 (아래 표준 안내문), 이후 무로그인.
- **GA4**: gd-gaondental.com 속성 권한이 있는 구글 계정으로 로그인된 크롬 + Browser MCP 연결.
- **AVI**: 제디 MCP 도구로 셀프서비스 (v7.387.0+) — 팀팩 설치 시 발급된 개인 JEDI_TOKEN이면 충분(Railway 접근 권한 불필요). 제디 MCP 미연결 상태면 이 단계만 사장님께 요청하고 나머지 진행.

## 실행 순서
0. **전월 비교값**: 전월 페이지 6개 fetch (허브 `75c11fcb50ce486da510f2e421fbc275`). 목표 달성률 표는 전월 종합의 "다음달 목표" 사용.
1. **자동 수집** — playwright 준비된 폴더에서 실행. 출력폴더 인자 예: `~/Downloads/gaon-YYYYMM`:
   - `node <skill>/scripts/place-collect.mjs <출력폴더> [YYYY-MM]` → place-*.txt 4개 (리포트/유입상세/리뷰/예약)
   - `node <skill>/scripts/blog-download.mjs <출력폴더>` → xlsx 4개 (조회수·순방문·사용시간=전체 월간, 유입분석=지난달 단월 자동)
   - `node <skill>/scripts/searchad-daily.mjs <출력폴더>` → performance_*.csv (일별 노출/클릭 — 검산용)
   - `node <skill>/scripts/searchad-campaigns.mjs <출력폴더>` → campaigns_*.xlsx (6유형 노출/클릭/CTR/CPC/비용 — 정본)
   - AVI (제디 MCP 셀프서비스, v7.387.0+): ① `ext_avi_measure` 호출 — `{ "tenant_id": "a0000000-0000-0000-0000-000000000002", "runs": 30 }` → `queued` 응답(측정은 백엔드에서 ~10분, 600콜) ② ~10분 뒤 `ext_avi_result` — `{ "tenant_id": 동일 }` → 엔진별(Perplexity/Gemini) 노출률·Top3·SOV·경쟁사 요약 수신. `already_running`이면 대기 후 ②만, `recent_result_exists`(20시간 내 기존 결과)면 바로 ② 조회. 재측정 강행은 `force: true` (회당 비용 $2~12 — 월 1회 원칙).
     - 측정 실행이 안 되면(도구 미노출/장애) 이 단계만 사장님께 요청하고 나머지 진행.
2. **GA4** (Browser MCP, 사장님 크롬 구글 로그인): URL 직접 라우팅 — `https://analytics.google.com/analytics/web/#/a363272208p498878528/reports/reportinghub?params=_u.date00%3DYYYYMMDD%26_u.date01%3DYYYYMMDD%26_u.comparisonOption%3Ddisabled`. 세션·총사용자 정확값 = 좌측 트리 리드생성>잠재고객(All Users 행). 채널그룹 = 리드생성 개요 카드.
3. **검산**: campaigns_*.xlsx 합계 노출 == performance_*.csv 일별 합계 (26-06: 50,372 일치).
4. **발행**: 템플릿 KB 구조·색상 규칙대로 6페이지 생성.
5. **마무리**: 검단가온 현재상태(`376efa2f2c3b811ebe01db0e7cfac610`) 헤더 갱신 + 텔레그램 DevMaster(`-5203319774`) 완료 알림.

## 로그인 정책 (중요)
- **ID/PW 자동 입력 금지** (네이버 봇 감지·캡차 위험). 로그인은 반드시 사장님이 직접.
- Playwright 프로필 `C:/Users/admin/.naver-mr-profile`에 "로그인 상태 유지" 세션 저장 → 평소엔 무로그인. 만료 시에만 1회 요청.
- **로그인 요청 표준 안내문** (처음 보는 사람 기준, 그대로 사용):
  > 화면에 크롬 창이 하나 떠 있습니다 — 네이버 로그인 페이지입니다. 평소 쓰시는 네이버 아이디와 비밀번호를 입력하고 [로그인] 버튼만 눌러 주세요. "로그인 상태 유지"는 미리 체크되어 있으니 그대로 두시면 됩니다. 로그인하면 나머지는 자동으로 진행되고, 끝나면 창이 저절로 닫힙니다.

## 함정 (26-05/06 실측 학습)
- 네이버 로그인 페이지 URL에 리다이렉트 목적지가 포함 → `url.includes()` 판정 금지, **hostname**으로 판정
- 스마트플레이스는 비로그인에도 페이지 셸이 뜸 → 본문 텍스트("로그인이 필요한"/"검단가온치과")로 로그인 판정
- 블로그 통계는 교차출처 iframe → browsermcp 클릭 불가, Playwright `frameLocator`만 가능
- 검색광고 `/campaigns` URL 직접 진입은 대시보드로 리다이렉트 → 사이드바 "전체 캠페인" **링크 클릭**으로 진입
- 검색광고 기간은 "지난달" 프리셋 (달력 조작 불필요) — **월초 실행 전제**
- 대시보드 다운로드 CSV는 일별 요약뿐(비용 없음) — 캠페인 xlsx가 정본
- GA4 SPA 클릭 라우팅 불안정 → URL 라우팅 우선, 이벤트 총계는 표시값 수준("2천")
- 탐색 없이 스크립트를 순차 1회씩만 실행 (창 반복 열림은 사용자 불만 요인)

## 데이터 소스 ID
스마트플레이스 place `7708222` / booking `786232` · 검색광고 ad-account `1790170`(ads.naver.com 신 UI) · GA4 `a363272208p498878528`(gd-gaondental.com) · 블로그 `gdgodental` · AVI 결과: 백엔드 `skill_execution`(skill_code='avi_measure', 줄갭 tenant) — `ext_avi_result`로 조회
