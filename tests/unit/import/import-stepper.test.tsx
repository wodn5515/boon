import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * ImportStepper a11y 회귀 잠금 (011 §B-5).
 *
 * 회귀 시드 (PR #8 🟢 #2 + PR #9 review §):
 *   - 비활성 단계(`current` 이후의 미래 단계 + onStepClick 미지정 시 과거 단계) 는
 *     현재 단순 `<div role="none">` 으로 렌더된다.
 *   - 스크린리더가 "비활성" 신호를 받지 못함 / 마우스 호버 시에도 cursor 변경 없음
 *     → 사용자가 "왜 이 단계 라벨이 클릭이 안 되는지" 알기 어렵다.
 *
 * 본 spec 은 worker 청산 결과를 잠근다:
 *   1. current=0, onStepClick=undefined 일 때 모든 미래 단계 div 에 `aria-disabled="true"` 가 있음.
 *   2. 그 div 에 Tailwind `cursor-not-allowed` 클래스가 적용됨.
 *   3. 활성(과거 단계 + onStepClick 제공) 단계는 <button> 으로 노출 — 이 상태에는 aria-disabled X.
 *
 * 빨강 시드:
 *   - 현재 코드 (components/import/import-stepper.tsx) 의 비활성 div 에는 두 속성 모두 없다.
 */

import { ImportStepper, IMPORT_STEPS } from "@/components/import/import-stepper";

describe("[B-5] ImportStepper — 비활성 단계 a11y", () => {
  it("onStepClick 미지정 시 모든 미래 단계가 aria-disabled='true' + cursor-not-allowed", () => {
    render(<ImportStepper current={0} />);

    // ol > li 안의 첫 자식 노드(아이콘 배지를 포함하는 div / button).
    // 모든 IMPORT_STEPS 라벨이 화면에 보인다.
    for (const step of IMPORT_STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }

    // current=0 일 때:
    //   - idx=0 은 현재 단계 (aria-current="step", aria-disabled 없음)
    //   - idx=1..4 는 미래 단계 — aria-disabled="true" + cursor-not-allowed
    // 비활성 단계는 모두 <div> (button 아님) — aria-disabled 속성으로 찾는다.
    const disabledNodes = document.querySelectorAll('[aria-disabled="true"]');
    // 5단계 중 1개가 현재라 나머지 4개가 비활성.
    expect(disabledNodes.length).toBe(IMPORT_STEPS.length - 1);

    // 각 비활성 노드에 cursor-not-allowed 클래스가 붙어 있는지.
    disabledNodes.forEach((node) => {
      expect((node as HTMLElement).className).toMatch(/cursor-not-allowed/);
    });
  });

  it("current=3, onStepClick 제공 — 과거 단계 0~2 는 <button> (aria-disabled 없음), 미래 단계 4 는 aria-disabled='true'", () => {
    const onStepClick = () => {};
    render(<ImportStepper current={3} onStepClick={onStepClick} />);

    // 과거 단계 = <button>. aria-label="${idx+1}단계로 돌아가기 — ${label}".
    expect(
      screen.getByRole("button", { name: /1단계로 돌아가기/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /2단계로 돌아가기/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /3단계로 돌아가기/ }),
    ).toBeInTheDocument();

    // 미래 단계(idx=4) 는 1개 → aria-disabled 노드 정확히 1개.
    const disabledNodes = document.querySelectorAll('[aria-disabled="true"]');
    expect(disabledNodes.length).toBe(1);
    expect((disabledNodes[0] as HTMLElement).className).toMatch(
      /cursor-not-allowed/,
    );
  });

  it("현재 단계 div 는 aria-disabled 가 붙지 않는다 (현재 = 진행 중이지 비활성 X)", () => {
    render(<ImportStepper current={2} />);

    // 현재 단계 라벨 = "일괄 설정" (IMPORT_STEPS[2]).
    const currentLabel = screen.getByText("일괄 설정");
    // 가장 가까운 aria-current="step" wrapper 가 있어야 하고, aria-disabled 는 없어야 한다.
    const currentWrapper = currentLabel.closest('[aria-current="step"]');
    expect(currentWrapper).not.toBeNull();
    expect(currentWrapper?.getAttribute("aria-disabled")).toBeNull();
  });
});
