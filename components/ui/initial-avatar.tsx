import * as React from "react";

import { cn } from "@/lib/utils";
import { getAvatarColor, getInitial } from "@/lib/avatar";

/**
 * 이니셜 아바타 (PRD §6).
 *
 * - 이름 첫 글자(한국어 1자 / 영어 2자)를 흰색 굵은 글씨로 보여준다.
 * - 배경색은 이름 해시 기반으로 초록 계열 HSL 풀에서 결정적으로 선택된다.
 * - V1 은 사진 업로드 없음 — 모든 친구가 이 컴포넌트 한 가지 표현을 공유한다.
 *
 * Server Component (no client-side state). 색상이 SSR/CSR 모두 동일하게
 * 계산되어야 하므로 `getAvatarColor` 는 결정적 순수 함수다.
 */

type AvatarSize = "sm" | "md" | "lg";

type InitialAvatarProps = {
  name: string;
  size?: AvatarSize;
  className?: string;
};

const SIZE_CLASSES: Record<AvatarSize, string> = {
  // PRD §6 + 슬라이스 명세: 32 / 48 / 64 px.
  // 텍스트 크기는 컨테이너 폭의 약 40~45% 가 시각적으로 균형이 좋아 그렇게 맞췄다.
  sm: "size-8 text-xs",
  md: "size-12 text-base",
  lg: "size-16 text-2xl",
};

export function InitialAvatar({
  name,
  size = "md",
  className,
}: InitialAvatarProps) {
  const initial = getInitial(name);
  const bg = getAvatarColor(name);

  return (
    <div
      data-slot="initial-avatar"
      role="img"
      aria-label={`${name || "친구"} 이니셜 아바타`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white select-none",
        SIZE_CLASSES[size],
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      <span aria-hidden>{initial}</span>
    </div>
  );
}
