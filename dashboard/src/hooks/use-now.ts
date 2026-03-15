"use client";

import { useState, useEffect } from "react";

/**
 * Returns the current timestamp, updating at the given interval.
 * This hook satisfies React 19's purity rules by keeping Date.now()
 * out of the render path.
 */
export function useNow(intervalMs = 10000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
