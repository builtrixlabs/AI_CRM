"use client";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

type Props = {
  children: ReactNode;
  delay?: number;
  className?: string;
  testId?: string;
};

/**
 * Stacked-section wrapper. Constitution IX: canvas is composed of
 * sections, never tabs. Motion is decorative (Apple-grade reveal);
 * `prefers-reduced-motion` is honored at the canvas root via MotionConfig.
 */
export function CanvasSection({ children, delay = 0, className = "", testId }: Props) {
  return (
    <motion.section
      data-testid={testId}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      {children}
    </motion.section>
  );
}
