// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { CanvasSection } from "@/components/canvas/canvas-section";

describe("CanvasSection", () => {
  it("renders children", () => {
    render(
      <CanvasSection testId="t1">
        <p>hello</p>
      </CanvasSection>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByTestId("t1")).toBeInTheDocument();
  });

  it("supports a delay prop without errors", () => {
    render(
      <CanvasSection testId="t2" delay={0.1}>
        <p>delayed</p>
      </CanvasSection>,
    );
    expect(screen.getByText("delayed")).toBeInTheDocument();
  });

  it("renders inside a reduced-motion MotionConfig without throwing", () => {
    render(
      <MotionConfig reducedMotion="always">
        <CanvasSection testId="t3">
          <p>reduced</p>
        </CanvasSection>
      </MotionConfig>,
    );
    expect(screen.getByText("reduced")).toBeInTheDocument();
  });
});
