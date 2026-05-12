import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Google OAuth 진입 버튼.
 *
 * 이 컴포넌트는 **UI 골격 전용 placeholder**다.
 * 실제 OAuth 호출(Supabase `signInWithOAuth` 등)은 다음 슬라이스에서
 * worker 에이전트가 결합한다. 지금은 onClick / form action을 받지 않고,
 * `<form action={...}>` 또는 클라이언트 핸들러로 감싸 사용할 수 있도록
 * `type="submit"` 기본값만 유지한다.
 *
 * 디자인 근거:
 * - PRD §6: 베이지 + 초록 톤. Google 브랜드 컬러는 G 로고 자체에만 적용,
 *   버튼은 outline + 흰 배경으로 OAuth 표준 가이드라인을 따른다.
 * - 너비 100% (`w-full`), 큰 사이즈 — 카드 폭 안에서 단일 CTA로 의미가 분명하도록.
 */

type GoogleButtonProps = React.ComponentProps<typeof Button>;

export function GoogleButton({
  className,
  children,
  ...props
}: GoogleButtonProps) {
  return (
    <Button
      type="submit"
      variant="outline"
      size="lg"
      className={cn(
        "h-11 w-full justify-center gap-3 text-sm font-medium",
        className,
      )}
      {...props}
    >
      <GoogleLogo aria-hidden className="size-5" />
      <span>{children ?? "Google로 계속하기"}</span>
    </Button>
  );
}

/**
 * Google 표준 G 로고 (4색).
 * lucide-react에는 Google 브랜드 마크가 없으므로 inline SVG로 처리.
 * 출처: Google Identity 가이드라인 (단색 변형 아님, 4-color 컬러 마크).
 */
function GoogleLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      focusable="false"
      {...props}
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
