/**
 * Category UI 도메인 타입.
 *
 * V1 카테고리 관리 UI 골격에서 컴포넌트들이 공유하는 props 형태.
 * worker 가 drizzle 스키마(`db/schema/categories.ts`)로 결합할 때 동일 필드명을
 * 갖도록 PRD §4 데이터 모델 그대로 snake_case 를 유지한다.
 *
 * - `is_system` = 기본 카테고리(💰물질/⏰시간·행동/💝마음) 여부. D-018:
 *   이름 변경만 가능, 삭제 불가, 아이콘·색상 변경 불가.
 * - `icon` = 이모지 1자 또는 null. 없으면 색상 칩 fallback.
 * - `color` = hex(#RRGGBB) — 초록 계열 + 파스텔 풀에서 고른다(디자이너 결정).
 * - `sort_order` = 사용자 정렬 가중치. 시스템 카테고리는 음수(또는 0~2),
 *   사용자 카테고리는 그 뒤 양수로 가입 시 자동 부여. UI 정렬도 이 값 오름차순.
 * - `entry_count` 는 categories 테이블 컬럼이 아니라 entries 슬라이스에서
 *   집계되어 결합되는 파생 값이다. V1 골격에서는 placeholder 0 으로 채운다.
 */
export type Category = {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  is_system: boolean;
  sort_order: number;
  /** entries 슬라이스가 집계하여 결합. V1 골격에선 0 placeholder. */
  entry_count: number;
};

/**
 * 카테고리 색상 풀 (디자이너 결정).
 *
 * PRD §6 디자인 시스템 + D-019 — 초록 메인 + 라임·연두 보조 + 부드러운 파스텔.
 * 모달의 색상 칩 그리드(2×4)로 노출되며, 기본값은 brand-primary.
 * 시스템 카테고리는 첫 3개를 그대로 사용 (cat-material / cat-time / cat-mind).
 *
 * 거절 대안:
 *  - 자유 hex 입력 — 사용자가 너무 어두운/탁한 색을 골라 톤 깨짐. UX 안정성 우선
 *  - 카테고리당 색상 자동 할당 — 사용자 선택 자유 박탈
 */
export const CATEGORY_COLOR_POOL = [
  { value: "#22c55e", label: "초록" },     // brand-primary (물질)
  { value: "#84cc16", label: "라임" },     // brand-lime (시간·행동)
  { value: "#4ade80", label: "연두" },     // brand-light (마음)
  // "옅은 라임" 은 "라임" substring 매칭에 걸려 E2E spec 의 getByRole({ name: "라임" }) 가
  // strict mode 충돌. label 을 "연노랑" 으로 분리 (#a3e635 는 lime-400 라 연노랑 톤에 가까움).
  { value: "#a3e635", label: "연노랑" },
  { value: "#16a34a", label: "짙은 초록" },
  { value: "#fbbf24", label: "주황빛 노랑" },
  { value: "#f472b6", label: "핑크" },
  { value: "#60a5fa", label: "파랑" },
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_POOL[0].value;

/**
 * 카테고리 정렬 — 시스템 우선, 그 후 sort_order 오름차순.
 *
 * 시스템 카테고리는 동일 sort_order 풀에 들어가더라도 항상 목록 상단에 고정한다
 * (D-018: 기본 카테고리는 보장된다는 시각 신호).
 *
 * 결정 로그 005 §D: V1 본 슬라이스부터 listCategories() 가 SQL ORDER BY 로 정렬하므로
 * 본 함수는 호출처 보호용 회귀 잠금 + 클라이언트 측 분기(예: 카테고리 select 컴포넌트의
 * 정렬 보존)를 위해 유지한다. mock(`MOCK_CATEGORIES`) 은 제거.
 */
export function sortCategories(rows: Category[]): Category[] {
  return [...rows].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
}
