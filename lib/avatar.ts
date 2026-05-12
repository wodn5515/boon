/**
 * 이니셜 아바타 유틸 (PRD §6 "이니셜 아바타").
 *
 * - 이름에서 표시 글자를 뽑는다: 한국어 1자 / 영어 2자 / 그 외 첫 1자.
 * - 이름 해시로 초록 계열 HSL 풀에서 결정적으로 배경색을 선택한다.
 *
 * 모든 함수는 순수 함수다. 동일 입력 = 동일 출력 (결정적). 색상은 SSR/CSR
 * 양쪽에서 같은 값이 나와야 하므로 Math.random 따위 비결정적 소스를 쓰지 않는다.
 */

/**
 * 초록 계열 HSL 아바타 색상 풀.
 *
 * PRD §6 디자인 시스템 색상(브랜드 primary `#22c55e` 등)을 기준으로 잡은
 * 6개 초록·라임·민트 색조 변주. 각 색상은 흰 글자 위에 충분한 명도 대비를
 * 갖도록 명도(L)를 44~50% 사이로 통일했다.
 *
 * 값 선택은 디자이너 자율 판단 (Lead 위임).
 */
export const AVATAR_COLOR_POOL = [
  "hsl(142 71% 45%)", // 메인 초록 (brand-primary 톤)
  "hsl(120 60% 45%)", // 정통 그린
  "hsl(84 81% 44%)", // 라임
  "hsl(95 70% 48%)", // 옐로우-그린
  "hsl(160 65% 47%)", // 민트
  "hsl(170 55% 44%)", // 청록 끝자락 (티얼)
] as const;

/**
 * 표시 이니셜을 만든다.
 * - 한글 문자가 1자라도 포함 → 첫 한글 1자
 * - 그 외 → 알파벳/숫자 첫 2자를 대문자로
 * - 빈 입력 → "?"
 */
export function getInitial(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";

  // 한글(가-힣) 또는 한자 등 동아시아 문자가 있으면 첫 글자만 사용.
  // Unicode property escape 대신 BMP 범위로 단순 매치 — 한자/이모지 포함 케이스도
  // "동아시아 1자" 로 통일되어 V1 톤에 맞다.
  const koreanMatch = trimmed.match(/[가-힯㄰-㆏ᄀ-ᇿ一-鿿]/);
  if (koreanMatch) {
    return koreanMatch[0];
  }

  // 영어/숫자: 첫 두 자, 공백 무시.
  const ascii = trimmed.replace(/\s+/g, "");
  return ascii.slice(0, 2).toUpperCase();
}

/**
 * 결정적 해시: name 의 모든 문자 코드 합 → 풀 길이로 모듈러.
 *
 * 단순하지만 V1 톤에 충분하다 (PRD §6 "이름 해시 기반"). 분포 균일성은
 * 풀 크기가 6 정도라 큰 문제 없음.
 */
export function getAvatarColor(name: string): string {
  const seed = (name ?? "").trim();
  if (!seed) return AVATAR_COLOR_POOL[0];

  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) {
    sum += seed.charCodeAt(i);
  }
  return AVATAR_COLOR_POOL[sum % AVATAR_COLOR_POOL.length];
}
