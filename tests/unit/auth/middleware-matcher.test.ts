import { describe, expect, it } from "vitest";

/**
 * Next.js middleware 보호 라우트 매처 단위 테스트 (시나리오 7).
 *
 * worker 구현 가정:
 *   - `lib/auth/matcher.ts` 에서 `shouldProtect(pathname: string): boolean` 함수를 export
 *   - 같은 파일에서 Next.js 미들웨어 `matcher` 설정과 일치하는 로직을 노출
 *   - 매처가 인증 체크를 거쳐야 하는 경로(true)와 통과시키는 경로(false)를 구분
 *
 * 매처 규칙 (Lead 명세):
 *   통과 (인증 체크 우회):
 *     - /login
 *     - /api/auth/*
 *     - /_next/*  (Next.js 정적 자산)
 *     - /favicon.ico, /robots.txt 등 정적 파일 확장자 보유 경로
 *   보호 (인증 체크):
 *     - / 및 그 외 모든 사용자 라우트 (/friends, /entries, /settings 등)
 */

import { shouldProtect } from "@/lib/auth/matcher";

describe("shouldProtect — 보호 라우트 매처", () => {
  describe("보호 대상 (true)", () => {
    it.each(["/", "/friends", "/entries", "/settings", "/friends/123"])(
      "%s 는 인증 체크가 필요하다",
      (path) => {
        expect(shouldProtect(path)).toBe(true);
      },
    );
  });

  describe("통과 대상 (false)", () => {
    it.each([
      "/login",
      "/api/auth/callback",
      "/api/auth/signout",
      "/auth/callback",
      "/_next/static/foo.css",
      "/_next/image",
      "/favicon.ico",
    ])("%s 는 인증 체크를 우회한다", (path) => {
      expect(shouldProtect(path)).toBe(false);
    });
  });
});
