/**
 * drizzle 스키마 barrel export.
 *
 * 다음 슬라이스부터 friends / categories / entries 가 추가될 때 여기에 모인다.
 * 마이그레이션 도구는 `db/schema/*.ts` 를 직접 스캔하지만, 애플리케이션 코드는 이 barrel 로 통일.
 */
export * from "./users";
