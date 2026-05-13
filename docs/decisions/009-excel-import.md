---
slice: excel-import (PR #8)
base: stage
worktree: .worktrees/feature-excel-import
date: 2026-05-13
status: in-progress (worker 결합 대기)
---

# 009. 엑셀 import 슬라이스

PRD §3 "엑셀 가져오기" 풀 흐름 결합. 50~200 row 일괄 등록 + 친구 매칭 검토 + 단일 트랜잭션 bulk insert.

본 결정 로그는 008 메타 노트("디자이너는 결정 로그 손대지 마라 — Lead 영역")에 따라 디자이너 라운드 직후 Lead가 처음부터 정리한다. 디자이너는 보고로만 자율 판단 사항을 전달했다.

---

## §A. 진입점 — 페이지 채택 (모달 거절)

`/entries/import` 라우트 신설 (Server Component). 모달은 거절.

**근거**: 50~200 row 검토 흐름. 컬럼 매핑 + 매칭 검토 + 미리보기까지 모달 viewport 안에 압축하면 정보 밀도가 비현실적. 모바일 퍼스트에서도 풀스크린 페이지가 자연.

**거절된 대안**: 단일 모달(Dialog) 5단계 stepper — 데스크탑은 가능하지만 모바일에서 viewport 안에 200 row 매칭 리스트가 들어갈 수 없음.

## §B. 5단계 워크플로우 + 가로 stepper

Step 1 업로드 → Step 2 컬럼 매핑 → Step 3 이벤트 설정 → Step 4 매칭 검토 → Step 5 미리보기/실행.

가로 stepper + 번호 배지(완료=초록, 활성=베이지 강조, 미진입=회색). 모바일은 가로 스크롤 또는 step 라벨 축약.

**근거**: 사용자가 "지금 어디" 인지 즉시 인지. settings/entries 폼 동선과 톤 일관.

## §C. URL 동기화 V1 생략

ImportWizard 의 step state 를 URL 에 노출하지 않음. 페이지 새로고침 시 Step 1 부터 다시 시작.

**근거**: 파일 입력은 어차피 새로고침 시 사라짐. URL 동기화는 복잡도 대비 효용 낮음. /entries 페이지의 searchParams 패턴(004 §D, 008 §A)과 다른 결정이지만 도메인 성격이 다름 — 필터는 URL 가시·공유 가치가 있지만 import 진행 상태는 일회성.

**V2 메모**: 대용량 import 진행 표시 + 중단/재개가 필요해지면 그때 server 측 진행 상태 + URL 동기화 도입 검토.

## §D. SheetJS 클라이언트 파싱 (서버 업로드 X)

`xlsx@^0.18.5` 추가. 브라우저에서 직접 파싱해 row 배열을 만들고, bulk import 단계에서만 정제된 텍스트 필드를 Server Action 으로 전송.

**근거**: 사용자의 개인 부조금 장부에는 민감 정보가 들어 있을 수 있음(이름·금액·관계). 원본 .xlsx 를 서버 디스크·스토리지에 두지 않으면 유출 면 최소. PRD §3 "회상 노트 톤" 정합.

**거절된 대안**: 서버 업로드 후 파싱 — 파일 저장소(Supabase Storage 등) 필요 + 정리 책임 + 비용. V1 토이 단계에서는 client 파싱이 운영 부담 0.

## §E. 자동 컬럼 감지 키워드

`lib/import/column-detect.ts::detectColumns(headers)`:
- name: "이름" / "성명" / "고객" / "name"
- amount: "금액" / "축의금" / "부조금" / "amount"
- note: "비고" / "메모" / "관계" / "note"

괄호 단위 정규화("금액(원)" → "금액"). trim + 대소문자 무시.

**근거**: 한국 청첩장·부고 명단 양식에서 흔한 헤더. 자동 감지는 권장값일 뿐 Step 2 에서 사용자가 매핑을 직접 변경 가능.

**거절된 대안**: 머신러닝/embedding 기반 매칭 — V1 과잉. 키워드 풀이 7개로 90% 이상 커버.

## §F. Step 3 보답 시점 기본 = `specific_event`

entries 신규 폼 기본은 `anytime`(006 §A)이지만, import 흐름은 `specific_event` 가 기본.

**근거**: D-016 결혼식·장례식 등 사건 단위 import 가 대다수. 사용자가 "결혼식 축의금 명단"을 일괄 import 하는 시점에 "특정 이벤트가 있다"는 의미가 이미 강함.

**거절된 대안**: entries 폼과 같은 `anytime` 기본 — import 흐름 의미 손상.

## §G. Step 4 매칭 UX (D-026 명시 확인)

| 매칭 결과 | 초기 상태 | 사용자 행동 |
|---|---|---|
| 0건 | "새 친구로 추가" 자동 체크 | 체크 해제 시 skip |
| 1건 | "같은 사람" 체크박스 **미체크** | 명시 체크해야 매칭 확정 |
| 다건 | 라디오 미선택(`multiple-new` = "새 친구로 만들기" 의도) | 라디오 후보 선택 또는 새 친구 선택 |

**근거**: D-026 — "친구 매칭은 사용자가 명시 확인해야 한다". 1건 매칭이 자동 체크되면 동명이인을 같은 사람으로 잘못 묶을 위험. 사용자에게 검토 강제.

**거절된 대안**: 1건 매칭 자동 체크(편의 우선) — 동명이인 오매칭 위험. 회상 노트 톤은 "정확한 기억"이 핵심.

## §H. 신규 친구 dedup (트랜잭션 내부)

동일 `newFriendName` 이 여러 row 에 등장하면 friend 1건만 생성하고 entries 들이 같은 friend_id 를 참조.

**근거**: 한 친구에게 결혼식·돌잔치 두 번 부조한 history 를 같은 import 에서 일괄 등록할 수 있음. dedup 안 하면 친구 풀에 중복이 쌓임.

## §I. 메모 빌더 (`lib/import/memo-builder.ts` 분리)

`buildMemo({eventName, friendName, amount, note}) → string`. 결과: `결혼식 · 박지원 · 1,000,000원 · 신부 측 친구`.

- 구분자: ` · ` (가운데점 좌우 공백)
- 누락 필드는 skip
- 금액 ko-KR 콤마 포맷 (`Intl.NumberFormat("ko-KR")`)
- amount 가 0/null/undefined 면 amount slot 자체 생략

**lib 분리 의무**: test-writer 보고 §Lead 판단 요청 #1 채택. Step 5 미리보기와 bulkImportEntries 둘이 같은 함수를 공유 → import 후 entries 리스트에 보이는 메모와 미리보기가 동일함을 보장.

**근거**: 디자이너 라운드에서 Step 5 인라인으로 두었으나, test-writer 가 "둘이 같은 함수여야 미리보기 = 실제 결과 정합"이라고 지적. 인라인 유지 시 둘 사이 표류 위험.

## §J. `bulkImportEntries` 단일 트랜잭션 + 본인 소유 cross-check

`db.transaction` 안에서:
1. dedup 된 newFriendName 들을 friends insert (정정-1: user_id 명시)
2. 모든 row 의 entry insert. friend_id 는 (a) 기존 매칭 friend_id 또는 (b) 방금 만든 신규 friend_id. category_id 는 본 import 의 단일 category_id (Step 3 입력)
3. 어느 row 라도 본인 소유가 아닌 category_id / friend_id 를 시도하면 트랜잭션 전체 롤백
4. 마지막에 `revalidatePath("/entries")` + `revalidatePath("/")`

**근거**: 정정-1 패턴(004 §"sfx 라운드 1 🔴 #1") 확장. read 경로는 application-layer eq 가 잠그고, write 는 본 슬라이스가 처음 도입하는 bulk insert 라 row-by-row 대신 트랜잭션 boundary 에서 cross-check.

**부분 실패 정책**: 일부 row 만 성공/실패 시 전체 롤백. partial success 거절.

**근거 (부분 실패 거절)**: 200 row 중 5건만 성공하면 사용자는 "어떤 게 들어갔는지" 알 길이 없음. import 흐름은 "전부 들어갔거나 하나도 안 들어갔거나" 가 회상 노트 톤 정합.

## §K. 매칭 SQL: `matchFriendsByName` LEFT JOIN LATERAL

`matchFriendsByName(names: string[])` 본격:
- 본인 친구 풀(soft-deleted 제외) 에서 case-insensitive trim 매칭
- 각 매칭된 friend 에 최근 신세 1건(메모 + received_date) LEFT JOIN LATERAL — 사용자가 매칭 검토 시 "이 사람과의 마지막 흔적"을 즉시 확인
- 1건 → `single`, 2+건 → `multiple`(candidates 배열), 0건 → `none`

**근거**: 동명이인 검토 UX 가 핵심. 메모/신세 날짜가 없으면 사용자가 "이 사람이 맞나?" 판단 불가.

## §L. Step 5 미리보기 = 상위 10건 + 더보기

200 row 일괄 노출하면 페이지가 너무 길어짐. 상위 10건 + 더보기 토글.

**근거**: 미리보기의 목적은 "메모 빌더 + 매칭 결과 형식 확인" 이지 "200 row 전수 검사" 가 아님 (그건 Step 4 매칭 검토 단계의 역할).

## §M. test-writer 라운드 spec 채택 (Lead 판단 5건)

test-writer 보고 5건 모두 채택:

1. **memo-builder lib 분리 의무**: 채택. §I 명문화.
2. **redirect querystring 만 잠금, 토스트는 V2**: 채택. sonner/toast 결합 부담은 본 슬라이스 범위 밖. 시나리오 6 은 `/entries?imported=N` querystring 잠금 + entries 리스트에 메모 prefix 노출로 충분.
3. **시나리오 10/10b placeholder 통과 수용**: 채택. worker 본격 결합 후 의미 발현. 회귀 잠금이 약하지만 본 슬라이스 범위 안에서 강화 불가 — 미래에 partial insert 누수가 들어가면 빨갛게 됨.
4. **PR #7 🟢 #1 parseDate semantic validation V2 deferred**: 008 §M 정합 유지. 본 슬라이스에서 처리 안 함.
5. **mock 시연 버튼 보존**: 채택. worker 결합 시 mock 버튼 유지. 사용자가 .xlsx 없이도 흐름을 살펴볼 수 있는 시연 경로는 V1 가치 큼.

## §N. PR #7 리뷰 청산 매핑

| 항목 | 본 슬라이스 처리 |
|---|---|
| 🟢 #1 parseDate semantic validation | V2 deferred (위 §M-4) |
| 🟢 #2 엑셀 placeholder anchor → 404 | **본 슬라이스 청산** — 디자이너가 `b51b07c` 에서 `/entries/page.tsx` 의 anchor → `<Link href="/entries/import">` 로 결합 (시나리오 1 회귀 잠금) |
| 🟢 #3 `data-memo` attribute 길이 | V2 deferred (008 §M, 무한 스크롤 도입 시점) |
| 🟢 #4 reorderEntries tiebreak | V2 deferred (data-created-at 추가 + filter-bar tiebreak 정합) |
| 💬 #5 getRecentEntries 위임 분리 가능성 | V2 메모 (위젯 A v2 등장 시점) |

PR #7 리뷰 5건 중 1건(🟢 #2)은 본 슬라이스 디자이너 라운드에서 즉시 청산, 4건은 V2 메모.

## §O. README 동기화

본 슬라이스에서 README 갱신 필요:
- 사이트맵에 `/entries/import` 추가
- 스택에 `xlsx`(SheetJS) 추가
- 데이터 모델은 변경 없음(기존 friends + entries 위에서 bulk insert)

worker spawn 프롬프트에 README 동기화 명시.

## §P. V2 메모 (본 슬라이스 외)

- 진행 상태 server-side 추적 + URL 동기화 (대용량 import 중단/재개)
- 부분 실패 시 실패 row 만 다시 보기 (회상 노트 톤상 트랜잭션 전부/0 이 V1 자연, 다만 1000+ row 시점에 재검토)
- 매칭 후보 ML 추천(별명·동음이의)
- import history (어떤 .xlsx 를 언제 가져왔는지)
- toast 결합 (sonner) — 시나리오 6 카피 회귀 잠금 강화 가능

## §Q. 메타 노트 — 디자이너 결정 로그 권한 정책 첫 실행

008 메타 노트 후 첫 슬라이스로, 디자이너가 결정 로그를 직접 작성하지 않음. 본 009 는 Lead 가 처음부터 작성.

디자이너 보고 형식("자율 판단 사항 — Lead 결정 로그 정리 대상" + "거절된 대안 — 보고만") 이 정책 정합. 향후 슬라이스에서 본 패턴 유지.

---

## §R. worker 라운드 준비

worker 결합 작업 범위:
1. `lib/import/queries.ts::matchFriendsByName` 본격 SQL (정정-1 + LEFT JOIN LATERAL)
2. `lib/import/queries.ts::bulkImportEntries` 본격 SQL (트랜잭션 + dedup + cross-check + revalidate)
3. `lib/import/memo-builder.ts` 분리 (§I) — Step 5 인라인 → lib 호출로 교체
4. ImportWizard Server Action 결합 (Step 5 실행 → bulkImportEntries → router.push(`/entries?imported=N`))
5. mock 시연 버튼 보존 (§M-5)
6. README 동기화 (§O)
7. 선작성된 spec 전부 통과 (524fb65 기준 빨강 15건 → 녹색, 통합 placeholder 통과 2건도 의미 발현 후 녹색 유지)

worker 가 spec 약화 요청을 보내면 Lead 자율 판단.
