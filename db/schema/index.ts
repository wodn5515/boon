/**
 * drizzle 스키마 barrel export.
 *
 * entries 는 다음 슬라이스에서 추가된다.
 * 마이그레이션 도구는 `db/schema/*.ts` 를 직접 스캔하지만, 애플리케이션 코드는 이 barrel 로 통일.
 */
export * from "./users";
export * from "./friends";
export * from "./categories";
