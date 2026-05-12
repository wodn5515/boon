"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, NotebookPen, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 인증된 사용자용 네비게이션 (PRD §5, §6).
 *
 * 데스크톱: 상단 가로 네비 (logo + 메뉴 + 우측 액션). sticky.
 * 모바일: 하단 탭 네비. fixed bottom-0.
 *
 * 두 변형 모두 같은 라우트 집합을 가리킨다. 활성 라우트는 brand-primary 강조.
 *
 * 디자이너 자율 판단 (Lead 위임):
 *   - 모바일 탭 4개 명칭: "홈 / 친구 / 신세 / 설정"
 *     (PRD §5 사이트맵의 `/`, `/friends`, `/entries`, `/settings` 일치)
 *   - 데스크톱은 좌측 사이드바 대신 상단 가로 네비 채택 (간단·구현 비용 낮음).
 *     사이드바는 V2 에서 위젯 수 늘어날 때 재논의.
 */

const ITEMS = [
  { href: "/", label: "홈", icon: Home },
  { href: "/friends", label: "친구", icon: Users },
  { href: "/entries", label: "신세", icon: NotebookPen },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {/* 데스크톱 / 태블릿: 상단 가로 네비 (≥ sm) */}
      <header className="sticky top-0 z-40 hidden border-b border-border bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70 sm:block">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="font-heading text-xl font-bold tracking-tight text-foreground"
            aria-label="Boon 홈"
          >
            Boon
          </Link>
          <nav aria-label="주요 메뉴" className="flex items-center gap-1">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* 모바일: 하단 탭 네비 (< sm) */}
      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 sm:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
                    active
                      ? "text-brand-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
