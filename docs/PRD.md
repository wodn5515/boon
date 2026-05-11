# Boon (분) — PRD

> **이중 의미**: 🇬🇧 Boon = 은혜 / 🇰🇷 분 = 바람이 분다
> **스토리**: "받은 마음이 바람처럼 분다"

## 1. Product Overview

### Concept
Boon은 친구한테 받은 신세를 기록하는 **1인용 인간관계 회상 노트**다. 받은 마음을 항목 단위로 기록하고, 가끔 들여다보면서 어떤 친구한테 어떤 마음을 받았는지 자연스럽게 환기한다. "갚아야 한다" 강박은 없다 — 자율적 회상 + 부드러운 알림이 본질.

### Value Proposition
- 받은 신세 안 까먹기 (자기 인식)
- 친구 생일 다가올 때 받은 마음 모음 → 부드러운 보답 영감
- 결혼식/장례식 같은 큰 이벤트에서 받은 신세 일괄 정리 (엑셀 import)
- 시간 누적되면 본인 인간관계 패턴 발견

### Brand
- **이름**: Boon (분)
- **로고 모티프**: 별 + 바람 (별이 바람을 타고 흐르는 느낌)
- **컬러**: 베이지/크림 베이스 + 초록/연두 브랜드
- **톤**: 부드러운 회상 노트. 자연/식물 메타포

### Non-goals (의도적 제외)
- 부채/잔고/점수 시스템 (강박 톤 ❌)
- 사용자 간 공유 / 소셜 기능
- 베푼 신세 트래킹 (V2)
- AI 런타임 사용 (개발에는 AI 사용, 서비스 런타임엔 X)
- 알림 (푸시/이메일)

---

## 2. User Roles

### Single User (Authenticated)
- Google OAuth 로그인
- 본인용 비밀 노트
- 사용자별 데이터 격리 (다른 사용자 데이터 발견/접근 불가)
- 친구나 다른 사람과 공유 없음

---

## 3. Feature List (V1)

### 인증
- Google OAuth 로그인 / 로그아웃

### 친구 관리
- 친구 추가: 이름 (필수) + 생일 월/일 (옵션) + 메모 (옵션)
- 친구 목록 보기 (검색, 정렬)
- 친구 상세 페이지 (그 친구한테 받은 신세 모음)
- 친구 정보 수정
- 친구 삭제 (soft delete) + cascade UI 알림
- 이니셜 아바타 자동 생성 (이름 해시 기반 배경색)

### 카테고리 관리
- 기본 카테고리 3개: 💰 물질 / ⏰ 시간·행동 / 💝 마음
  - 시스템 제공, 삭제 불가, 이름 변경 가능
- 사용자 정의 카테고리 추가/수정/삭제
- 카테고리 삭제 시: 사용 중이면 다른 카테고리로 신세 이전 강제

### 신세 (Entry) 관리
- 신세 추가 모달:
  - 친구 (combobox + 인라인 빠른 생성)
  - 카테고리
  - 내용 메모 (자유 텍스트)
  - 받은 날짜
  - 보답 시점 타입: 언제든 / 그 사람 생일 / 특정 이벤트 대기 / 특정 날짜
- 신세 수정 (모달)
- 신세 삭제 (hard delete)
- 갚음 표시 (옵션) + 갚은 방법 메모 + 갚은 날짜

### 메인 대시보드 (`/`)
- **A** 받은 신세 리스트 (최근순, 친구/카테고리 필터)
- **B** 친구별 카드 그리드 (받은 신세 수 + 최근 신세 + 생일 D-N)
- **C** 다가오는 생일 + 그 친구한테 받은 신세 모음 (이번 달 생일 친구)
- **D** 이번 달 요약 카드 (받은 수, 카테고리 분포 차트, 신세 많이 받은 친구 Top 3)
- **E** 빠른 입력 FAB (항상 떠 있음)

### 신세 리스트 / 검색 (`/entries`)
- 전체 신세 리스트
- 텍스트 검색 (메모)
- 필터: 친구, 카테고리, 날짜 범위
- 정렬: 최근순, 오래된순
- 엑셀 import 진입점

### 친구 목록 (`/friends`)
- 친구 카드 그리드
- 검색 (이름)
- 정렬: 이름순, 받은 신세 수, 최근 활동

### 친구 상세 (`/friends/[id]`)
- 친구 정보 (이름, 생일, 메모)
- 받은 신세 타임라인
- 친구별 통계 (총 신세 수, 카테고리 분포)
- 생일 D-N 카운트다운 (생일 있으면)
- 정보 수정 / 친구 삭제

### 엑셀 Import
- 엑셀 파일 업로드 (.xlsx)
- 컬럼 매핑 UI: 이름 / 금액 / (옵션) 비고
- 일괄 설정: 이벤트명(메모 prefix), 받은 날짜, 카테고리(기본=물질), 보답 시점(기본=특정 이벤트 대기)
- 자동 이름 매칭 + 사용자 확인:
  - 1명 매칭 → 친구 메모/최근 신세 표시 + "같은 사람?" 체크
  - 동명이인 → 후보 라디오 + 새로 만들기 옵션
  - 0명 → 새 친구 자동 생성
- 미리보기 (N명 새 생성, M명 매칭)
- 일괄 import 실행

### 설정 (`/settings`)
- 카테고리 관리 (추가/수정/삭제/정렬)
- 로그아웃
- (옵션) 계정 정보

---

## 4. Data Model

### `users` (Supabase Auth 통합)
| field | type | note |
|---|---|---|
| id | UUID PK | Supabase Auth user id |
| email | text | |
| google_id | text | |
| created_at | timestamp | |

### `friends`
| field | type | note |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id | |
| name | text | required |
| birthday_month | int (1-12) | nullable |
| birthday_day | int (1-31) | nullable |
| note | text | nullable, 친구에 대한 자유 메모 |
| is_deleted | boolean | default false (soft delete) |
| created_at | timestamp | |
| updated_at | timestamp | |

### `categories`
| field | type | note |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id | |
| name | text | |
| icon | text | emoji (옵션) |
| color | text | hex |
| is_system | boolean | 기본 3개 표시 (삭제 불가) |
| sort_order | int | UI 정렬 |
| created_at | timestamp | |
| updated_at | timestamp | |

> 가입 시 기본 3개 카테고리를 user_id 연결로 자동 생성 (is_system=true).

### `entries` (받은 신세)
| field | type | note |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id | |
| friend_id | UUID FK → friends.id | |
| category_id | UUID FK → categories.id | |
| memo | text | |
| received_date | date | |
| repayment_timing | enum | 'anytime' / 'friend_birthday' / 'specific_event' / 'specific_date' |
| repayment_specific_date | date | nullable, repayment_timing='specific_date'일 때만 |
| is_repaid | boolean | default false |
| repaid_method | text | nullable |
| repaid_date | date | nullable |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## 5. Sitemap & Routing

```
/                         홈 대시보드 (위젯 5개)
/login                    Google OAuth
/friends                  친구 목록 (검색/정렬)
/friends/[id]             친구 상세 (받은 신세 타임라인)
/entries                  신세 리스트 (검색/필터/날짜범위/엑셀 import)
/settings                 설정 (카테고리 관리)
```

**Modal** (페이지 X):
- 신세 추가/수정 모달
- 친구 정식 추가/수정 모달
- 카테고리 추가/수정 모달
- 엑셀 import 모달
- 친구 삭제 확인 모달

---

## 6. UX Detail

### 디자인 시스템
- **컴포넌트**: shadcn/ui
- **스타일**: Tailwind CSS
- **폰트**: Pretendard (한국어 메인)
- **다크 모드**: V2 (V1은 라이트만)

### 컬러 토큰
```css
--background: #FAF7F0;        /* 베이스 (크림) */
--card: #FFFFFF;              /* 카드 */
--brand-primary: #22C55E;     /* 초록 메인 */
--brand-lime: #84CC16;        /* 라임 */
--brand-light: #4ADE80;       /* 연두 */
--foreground: #1F2937;        /* 텍스트 */
--muted: #78716C;             /* 그레이 (스톤) */

/* 카테고리 차트 컬러 (초록 명도 차이) */
--cat-material: #22C55E;      /* 물질 - 초록 */
--cat-time: #84CC16;          /* 시간·행동 - 라임 */
--cat-mind: #4ADE80;          /* 마음 - 연두 */
```

### 신세 추가 모달 UX
```
친구: [combobox 검색]
  ▶ 입력 시 자동완성
  ▶ 매칭 없으면 [+ "○○○" 새 친구로 추가] 노출
  ▶ 클릭 시 인라인으로 친구 즉석 생성 (이름만 받음)

카테고리: [드롭다운] (아이콘 + 이름)
내용: [텍스트]
받은 날짜: [date picker] (기본 = 오늘)
보답 시점: [드롭다운] (4개 옵션)
  ▶ "특정 날짜" 선택 시 추가 date picker 노출

[취소] [추가]
```

### 엑셀 Import 풀 흐름
1. 파일 업로드 (.xlsx)
2. 컬럼 매핑: 이름 / 금액 / (옵션) 비고
3. 이벤트 일괄 설정: 이벤트명 / 받은 날짜 / 카테고리(기본=물질) / 보답 시점(기본=특정 이벤트 대기)
4. **매칭 검토 (핵심)**:
   - 각 row마다 매칭 상태 표시
   - 매칭된 친구는 친구 메모/최근 신세 같이 표시 (사용자 판단 도움)
   - "같은 사람" 체크박스 / "새 친구로" 옵션
   - 동명이인은 라디오 후보
5. 미리보기: N명 새 생성 / M명 매칭됨
6. import 실행 → 토스트 알림

### 친구 삭제 UX
- "이 친구 + 받은 신세 N개가 함께 사라집니다" 명시
- 위험 색상의 확인 버튼
- 실제: `friends.is_deleted = true`로 soft delete (entries는 그대로 DB에 남음)
- UI에선 삭제된 친구 + 그 친구 신세 안 보임
- V2: 휴지통 페이지로 복구 가능

### 반응형
- **데스크톱** (≥ 1024px): 사이드바 네비 + 메인 + 위젯 2~3열
- **태블릿** (640-1024px): 상단 네비 + 위젯 2열
- **모바일** (< 640px): 하단 탭 네비 + 위젯 세로 적층

### 이니셜 아바타
- 이름 첫 글자 (한국어 1자 / 영어 2자)
- 배경색: 이름 해시 기반 자동 (초록 계열 HSL 풀에서 선택)
- 텍스트: 흰색

---

## 7. Tech Stack

| 항목 | 선택 | 선택 근거 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript | 풀스택 한 번에, AI 코딩 도구 호환성 1위, Vercel 배포 최적 |
| UI 시스템 | shadcn/ui + Tailwind | 디자인 시스템 활용으로 시각 디자인 부담 흡수 |
| 폰트 | Pretendard | 한국어 메인 |
| Auth + DB | Supabase (Postgres + Auth) | Google OAuth 한 줄 설정, 무료 티어 충분 |
| ORM | Drizzle | TypeScript 네이티브, 가벼움, 마이그레이션 깔끔 |
| 차트 | Recharts (shadcn charts) | 디자인 시스템 통일 |
| 엑셀 파싱 | SheetJS (xlsx) | 산업 표준 |
| 배포 | Vercel Hobby | Next.js 최적화, 무료 |
| **운영 비용** | **$0/월** | Vercel Hobby + Supabase Free 슬롯 2/2 |

---

## 8. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # 서버측 작업용
DATABASE_URL=                   # Drizzle 직접 연결 (Postgres URL)
NEXT_PUBLIC_APP_URL=            # OAuth redirect
```

**별도 설정** (Supabase 대시보드):
- Authentication > Providers > Google On
- Google Cloud Console에서 OAuth Client ID/Secret 발급 후 Supabase에 입력
- Redirect URL: `https://<your-app>.vercel.app/auth/callback`

---

## 9. Out of Scope (V1)

### V2 기능 예약
- 베푼 신세 트래킹 (give 방향)
- Google Contacts 연동 (친구 일괄 import)
- `/stats` 풍부한 통계 페이지
- `/memories` 회상 페이지 (랜덤, 1년 전 등)
- 데이터 export (JSON/CSV)
- 친구 사진 업로드 (V1은 이니셜 아바타)
- 친구 복구 UI (휴지통)
- 다크 모드

### V2+ 기술
- 알림 (푸시, 이메일)
- 모바일 네이티브 앱
- 다국어 지원

---

## 10. Success Criteria

**본인 사용 기준**:
- 신세 1건 입력 < 30초
- 메인 페이지에서 "이번 달 받은 거" 한눈에 파악
- 친구 생일 다가올 때 그 친구한테 받은 거 모음 자동 노출
- 결혼식/장례식 후 엑셀로 50명 import 가능

**토이 정신**:
- 만들면서 기능 자연스레 떠오르면 V2/V3 자유 확장 (Boon의 핵심 매력)
- 매일 안 써도 동기 안 떨어짐 (강박 ❌)

---

## 11. Definition of Done (V1)

### 배포
- [ ] Vercel 배포 성공, 도메인 접근 가능
- [ ] Google OAuth 로그인 / 로그아웃 작동
- [ ] Supabase RLS 정책으로 사용자 데이터 격리 확인

### 기능
- [ ] 신세 추가/수정/삭제 (모달 UX 포함)
- [ ] 친구 추가/수정/삭제 (soft delete + cascade UI 알림)
- [ ] 카테고리 관리 (기본 3개 + 사용자 추가/수정/삭제 + 이전 강제)
- [ ] 메인 페이지 위젯 5개 모두 작동
- [ ] 6 페이지 모두 작동
- [ ] 검색/필터/날짜 범위 작동
- [ ] 엑셀 import 풀 흐름 (매칭 + 사용자 확인 + 일괄 추가)

### 디자인
- [ ] 베이지/크림 + 초록 톤 적용
- [ ] Pretendard 폰트 적용
- [ ] 반응형 (모바일/태블릿/데스크톱 다 동작)
- [ ] 이니셜 아바타 자동 생성

### 검증
- [ ] 본인 1주일 사용 후 큰 버그 없음
- [ ] 매일 입력 패턴이 자연스러움 (30초 이내)
