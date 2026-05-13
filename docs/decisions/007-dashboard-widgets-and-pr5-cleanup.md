# 007-dashboard-widgets-and-pr5-cleanup: 메인 대시보드 위젯 4종 + PR #5 잔여 청산

> 작성: 2026-05-13  /  작성자: Lead 에이전트
> 관련 작업: feature/dashboard-widgets

## 배경

V1 핵심 entity 4종(users·friends·categories·entries) 완료 마일스톤 도달 후 진입하는 첫 "기존 데이터 활용" 슬라이스. 새 도메인 추가 없이 PRD §3 메인 대시보드 위젯 4종(A 받은 신세 리스트 / B 친구별 카드 그리드 / C 다가오는 생일 + 받은 신세 / D 이번 달 요약) + Recharts 차트 결합 + /friends/[id] 통계 카드 본격 결합.

PR #5 사용자 종합 리뷰 5건 (006 §"사용자 PR #5 응대" 인계)을 본 슬라이스에 묶음 — 사용자 운영 원칙 "부채 청산 ↔ 새 도메인 통합" 적용.

(위젯 E 빠른 입력 FAB는 PR #5에서 이미 결합 — 본 슬라이스 작업 외)

## 결정

### A. 메인 대시보드 페이지 (`/`) 구조 (PRD §3 + D-013)
- Server Component `app/(authenticated)/page.tsx`
- 상단 인사말: "안녕하세요, {사용자 이름 또는 이메일 username}"
- 그리드 레이아웃 (디자이너 채택):
  - 모바일 1열, 데스크톱 2열
  - 위젯 D는 `col-span-2` wide (이번 달 요약 + 카테고리 분포 차트가 wide 영역에 어울림)
- 5위젯 중 4개 본 슬라이스에 본격 결합 (E FAB는 PR #5 완료)

### B. Recharts + shadcn chart 채택 (PRD §7 정합)
- 디자이너 `npx shadcn@latest add chart` → `components/ui/chart.tsx`
- `recharts` 의존성 추가
- 차트 타입: **PieChart (donut, inner radius=28)** 채택
  - 회상 노트 톤("분포 인상" > 절대값 비교)
  - 카테고리 슬라이스 보통 3~6개라 가독성 충분
  - 범례는 차트 우측에 카드 형태 (Pie 자체 라벨은 작은 차트에서 가독성↓)
- `components/dashboard/category-distribution-chart.tsx` 공용 (위젯 D + /friends/[id] 통계 카드 둘 다 사용)
- 컬러 매핑: 시스템 카테고리는 `--cat-material/--cat-time/--cat-mind` 토큰, 사용자 카테고리는 각 `color` 컬럼

### C. 위젯 B 정렬 = 받은 신세 수 DESC + name ASC tiebreak (회상 노트 톤)
**채택**: 받은 신세 수 DESC (LEFT JOIN으로 count=0 친구도 포함), 동률은 name ASC.

**근거**: "최근 활동" 보다 "누적 인연" 이 회상 노트 톤(D-006 자율 회상)에 부합. 사용자가 친구별로 누적 신세량을 한눈에 보고 자연스럽게 회상.

**거절 대안**: 최근 활동 DESC (최근 활동 친구가 위로 — V2 알림 슬라이스에서 검토)

### D. 위젯 C = 30일 슬라이딩 윈도우 (PRD "이번 달" 자연어 해석)
**채택**: 오늘 ~ +30일 윈도우. D-N 오름차순 정렬. 친구별 최근 entries 1~3건 함께 표시.

**근거**: PRD "이번 달 생일 친구" 자연어를 달력 월이 아니라 30일 윈도우로 해석. 월말에 다음 달 초 생일이 시야에서 사라지지 않도록 — 사용자의 "선물 영감" 흐름이 끊기지 않음.

**거절 대안**: 달력 월 기준 (이번 달 1일~말일 — 월말에 다음 달 초 친구 누락)

### E. 위젯 D byCategory 정렬 = sortCategories 순서 (count DESC 거절)
**채택**: 시스템 카테고리 먼저(💰물질 → ⏰시간·행동 → 💝마음) + 그 다음 사용자 카테고리 sort_order ASC. count DESC 아님.

**근거**: sortCategories 순은 사용자가 매번 같은 위치에서 같은 카테고리를 볼 수 있어 시각 안정성·회상 용이성↑. count DESC는 매 달 순서가 바뀌어 시각 학습 비용 ↑.

**디자이너 mock과 충돌**: 디자이너 골격 mock은 count DESC라 worker 결합 시 sortCategories 순으로 표시되도록 query에서 정렬. mock 갱신은 어차피 삭제될 mock이라 손대지 않음.

### F. /friends/[id] 통계 = in-memory aggregate (별도 SQL aggregate 없이)
**채택**: `listEntriesByFriend(friendId)` 결과를 RSC 안에서 in-memory aggregate. 별도 `getFriendCategoryDistribution(friendId)` SQL 함수 없음.

**근거**: 친구 한 명의 entries는 보통 수십~수백 row → 클라이언트 측 aggregate 비용 매우 저렴. SQL 함수 분리 시 queries 표면적만 늘림.

### G. 위젯 A row = compact 신설 (EntryItem 재사용 안 함)
**채택**: `widget-recent-entries.tsx`에 compact row 디자이너가 신설. EntryItem 재사용 안 함.

**근거**: 메인 대시보드는 "시선 5건 정돈" 목적이라 수정·삭제 액션 노출 안 함. EntryItem은 친구 상세·entries 리스트의 본격 도메인 페이지에서 액션 보임. 컨텍스트 분리.

### H. PR #5 사용자 리뷰 5건 청산
1. **🟢 #1 `app/api/%5Ftest/reset/` URL 인코딩 명시 (대안 네이밍 거절)**:
   - 현 상태 유지 (`%5Ftest` URL 인코딩). 동작 확정 + 32 E2E spec 회귀 잠금
   - 결정 로그에 한 줄 명시 — "Next.js private folder convention(`_*` 라우팅 제외) 우회. URL 인코딩이 docs에 명시된 공식 우회 패턴. encoded segment private 처리 확장은 미래 가능성이라 V2 메모로 메모"
   - 대안 네이밍(`__internal/test-reset` 등)은 마이그레이션 비용 > 명시 비용. 거절
2. **🟢 #2 `entries.friend_id ON DELETE CASCADE` 의도 명시**:
   - `db/schema/entries.ts` 컬럼 정의 위 주석 추가 — "V1 friends는 soft delete 정책이지만 Supabase user 삭제 chain의 일괄 정리 보장을 위해 CASCADE 채택. V1에 friends 직접 hard delete 경로 없음. CASCADE 발동 = user 삭제 chain. `category_id RESTRICT`와 의도 비대칭 (카테고리는 강제 이전 우선)"
3. **🟢 #3 `parseMemo` 공백 trim**:
   - `lib/entries/parse-memo.ts` 신설 (test-writer가 spec 잠금 `@/lib/entries/parse-memo`)
   - `parseMemo("   ")` → `""` (공백만 → 빈 문자열 통일). 앞뒤 trim, 안쪽 공백·줄바꿈 보존
   - `app/(authenticated)/entries/actions.ts`의 inline `parseMemo` 제거, lib import로 교체
4. **🟢 #4 `deleteCategory` E2E vs production 분기 대칭화**:
   - production: application-layer inline 검사 (is_system 방어, 본인 소유, migrateTo 필수)
   - E2E: e2e-store 내부 검사
   - 통일안: e2e-store의 `e2eDeleteCategory`도 production과 동일 순서/메시지로 검증 — 인터페이스 균질
5. **💬 #5 `countEntriesByCategory` friend.is_deleted 정책 = (b) 현 상태 유지**:
   - **채택 사유**: entries.category_id FK는 ON DELETE RESTRICT. soft-deleted 친구의 entries도 카테고리에 묶여 있어, 카테고리 hard delete 시 RESTRICT 발동. count에 그 entries 포함이 정합. 사용자가 "안 보이는 친구의 5건이 카운트에 있다"는 의아함은 있으나, 카테고리 삭제 게이트 정확성 우선
   - 결정 로그에 명시. `tests/integration/entries/cross-domain.test.ts` 시나리오 18로 회귀 잠금 (test-writer 추가)

### I. 디자이너 자율 결정 10건 채택
1. 그리드 = 모바일 1열, 데스크톱 2열, D wide
2. 인사말 = 이메일 username + "친구" fallback
3. /friends/[id] 분포 = in-memory aggregate (§F)
4. 빈 상태 카피 = 회상 노트 톤 (강박 회피)
5. 위젯 A row = compact 신설 (§G)
6. 비교 카피 = "지난 달 N건 → 이번 달 M건" 단순 표기
7. friend_id CASCADE 명시는 Lead 영역 (§H-2에 반영)
8. 차트 타입 = Pie donut (§B)
9. 위젯 B 정렬 = 받은 신세 수 DESC (§C)
10. 위젯 C 윈도우 = 30일 슬라이딩 (§D)

### J. test-writer 자율 결정 6건 채택
1. parseMemo 분리 경로 = `@/lib/entries/parse-memo` (server-only 디렉티브 회피, §H-3)
2. 위젯 A 정렬 tiebreak = received_date DESC + created_at DESC (entries.queries와 동일 규약)
3. 위젯 C recent_memos 정렬 = received_date DESC
4. 위젯 D byCategory 정렬 = sortCategories 순 (§E, count DESC 거절)
5. birthday 회귀 잠금 + 시나리오 18 회귀 잠금 = 채택 (이미 충족 → 명시화 + 회귀 방어)
6. E2E 시나리오 6 `/entries` pathname만 검증 (페이지는 다음 슬라이스)

### K. README 동기화 점검
- "주요 기능" 표 메인 대시보드 행 그대로 (PRD §3 이미 반영)
- 사이트맵 / 그대로
- 데이터 모델 변경 없음
- 의존성 표에 Recharts 이미 PRD §7 명시 (실제 도입은 본 슬라이스)
- 큰 변경 없으면 worker가 점검 사실 PR 본문에 명시

## 근거

- **V1 핵심 entity 4종 완료 후 첫 "활용" 슬라이스**: 정정-1 패턴·RLS·e2e 격리 인프라가 안정된 베이스 위에서 위젯이 자연스럽게 데이터 표면 확장. 새 도메인 추가 없이 진입 매끄러움
- **Recharts 도입 시점 = 본 슬라이스**: PRD §7에 명시되어 있으나 차트 첫 등장이 위젯 D·친구 상세 통계. 더 이른 슬라이스에 도입은 의존성 dead weight
- **sortCategories 순 (count DESC 거절)**: 회상 노트 톤 = 시각 안정성 우선. 사용자가 매번 같은 자리에서 같은 카테고리를 보면서 회상
- **30일 슬라이딩 윈도우**: PRD "이번 달" 자연어를 사용자 관점(생일 안 놓치기)에 맞춰 해석. 달력 월은 시스템 관점
- **PR #5 5건 청산 통합**: 005 사용자 평가("부채 청산 ↔ 새 도메인 통합") 원칙 유지. 본 PR에 묶어 깔끔히

## 거절된 대안

- **(A) 차트 = BarChart** — 절대값 비교 강조라 회상 노트 톤보다 분석적 톤. 거절
- **(B) 위젯 B 정렬 = 최근 활동 DESC** — 최근 활동 친구가 위로 가지만 누적 인연 시각이 약해짐. V2 알림에서 검토. 거절
- **(C) 위젯 C = 달력 월 기준** — 월말에 다음 달 초 생일 누락. 거절
- **(D) 위젯 D byCategory = count DESC** — 시각 안정성↓ (매 달 순서 변동). 거절
- **(E) /friends/[id] = 별도 SQL aggregate** — 친구 1명 entries는 수십~수백, in-memory 비용 무시 가능. queries 표면적만 늘림. 거절
- **(F) %5Ftest 폴더명 변경** — 동작 확정 + spec 회귀 잠금. 마이그레이션 비용 > 명시 비용. 거절
- **(G) countEntriesByCategory = (a) friend.is_deleted=false 필터** — RESTRICT FK와 정합 깨짐. soft-deleted 친구 entries가 RESTRICT로 카테고리 삭제 차단되는데 count에서 안 보이면 사용자 혼란. 거절
- **(H) parseMemo trim 미적용 (현 상태 유지)** — 공백만 입력이 "빈 카드 위장". 거절

## 후속 영향

### 다음 슬라이스(entries-list) 진입 시 필수 결정
1. `/entries` 페이지 (PRD §3 신세 리스트·검색·필터·날짜 범위)
2. 위젯 A "전체 보기"의 destination 페이지 본격 구현
3. URL searchParams 기반 검색·필터 (friends 검색과 동일 패턴 — 정정-1 §D)
4. 엑셀 import 진입점은 entries-list 또는 별도 슬라이스

### V1 잔여 슬라이스 (사용자 권고 순서)
- (7) entries-list — `/entries` 검색·필터·날짜 범위
- (8) excel-import — 컬럼 매핑·매칭·일괄 import
- (9) friend-detail 통계 — 차트·생일 D-N 일부 (본 슬라이스 §F로 부분 완료)
- (10) V1 마무리 `/meta` — Playwright CI 빌드 모드, eslint flat config, nonce strict CSP

### V2 메모 (본 슬라이스에서 파생)
- `%5Ftest` Next.js path normalization 변경 모니터링 (`__internal/test-reset` 또는 명시적 opt-out 패턴 등장 시 마이그레이션)
- 위젯 B 정렬 = 최근 활동 DESC 옵션 토글
- 위젯 D byCategory = count DESC 옵션 (V2 분석 슬라이스)
- 위젯 C 윈도우 = 사용자 커스터마이즈 (7/14/30/60일)
- per-test session ID 기반 e2e-store namespace (006 §J-7 후속, V2)
- 다크 모드, 휴지통 복구 UI (PRD V2 명시)

---

## Lead 응대 라운드 (worker 보고, 2026-05-13)

worker가 Task A·B·C 구현 후 E2E 36/40 통과 + 3 spec 충돌 보고. Lead 자율 판단으로 처리.

### §1. 위젯 A·B 메모/링크 selector ambiguity (시나리오 2·4)

**worker 보고**: 
- 시나리오 2: 위젯 A entry row 메모 + 위젯 B 친구 카드 recent_memo가 동일 텍스트 → `getByText(memo)` strict 2 elements 위반
- 시나리오 4: 친구가 위젯 B + 위젯 C 둘 다 `${name} 상세 보기` 링크로 노출 → 매처 충돌

**결정 (옵션 A 채택)**:
1. **위젯 B의 `recent_memo` 노출 제거** — 메인 대시보드 시각 부하 감소. 메모는 위젯 A 5건이 회상 노트 톤 담당. 위젯 B는 "친구 그리드 6명 + 받은 신세 수 + 생일 D-N 배지"만
2. **위젯 B vs C 친구 카드 aria-label 차별화** — 위젯 B = `"${name} 친구 카드"`, 위젯 C = `"${name} 생일 다가옴"` 또는 `"${name} 다가오는 생일"`. 두 위젯이 시각·의미적으로 분리되어 사용자도 명확

**§C 부분 양보 명시**: 디자이너 자율 결정 §I-5("최근 신세 메모 1줄 truncate")의 위젯 B 부분만 양보. 디자이너의 의도(친구별 최근 활동 시각화)는 V2의 "위젯 B 정렬 = 최근 활동 DESC" 옵션과 함께 다시 검토 가치 — V2 메모 추가.

### §2. login.spec 시나리오 4 — PR #1 placeholder 카피 폐기

**worker 보고**: 디자이너 커밋 `88e4fa1`(메인 대시보드 재작성) 시점부터 페이지 placeholder "받은 마음이 바람처럼 분다"가 사라짐. login.spec 시나리오 4가 옛 PR #1 시점 카피를 잠그고 있어 실패.

**결정**: spec 갱신 정상 — PR #1 placeholder는 V1 진행 자연 폐기. test-writer 단발 호출로 시나리오 4를 대시보드 위젯 헤딩(예: "최근 받은 신세" 또는 "친구들")으로 갱신. 시나리오 의미는 보존("인증 후 `/` 진입 시 정상 페이지"). worker 영역 아님.

### §3. 결정 로그 갱신은 Lead 영역

worker는 결정 로그 손대지 마라. Lead가 본 섹션 + worker 보고 처리 후 docs 커밋 진행.

## V2 메모 추가 (Lead 응대 라운드에서 파생)
- 위젯 B 정렬 = 최근 활동 DESC 옵션과 함께 `recent_memo` 노출 재도입 검토 (현재는 누적 인연 우선이라 메모 노출 가치 작음)