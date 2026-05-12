// Vitest 전역 셋업.
// @testing-library/jest-dom의 매처(toBeInTheDocument 등)를 expect에 확장해
// 다음 슬라이스부터 test-writer가 작성하는 RTL 기반 spec에서 즉시 사용 가능하게 한다.
import "@testing-library/jest-dom/vitest";
