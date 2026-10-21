"use client";

import { useEffect, useState } from "react";

export type QualityTier = "high" | "medium" | "low";

export function useQualityTier(): { tier: QualityTier; reducedMotion: boolean; ready: boolean } {
  const [tier, setTier] = useState<QualityTier>("medium");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motionQuery.matches);
    const onChange = () => setReducedMotion(motionQuery.matches);
    motionQuery.addEventListener("change", onChange);

    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 4 : 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const mobile = window.matchMedia("(max-width: 768px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

    if (saveData || cores <= 2) setTier("low");
    else if (mobile || cores <= 4 || memory <= 4) setTier("medium");
    else setTier("high");

    setReady(true);
    return () => motionQuery.removeEventListener("change", onChange);
  }, []);

  return { tier, reducedMotion, ready };
}

export const QUALITY_PRESETS = {
  high: { dpr: [1, 2] as [number, number], shadows: true, guests: true, candles: true, labels: true, antialias: true },
  medium: { dpr: [1, 1.5] as [number, number], shadows: true, guests: true, candles: true, labels: true, antialias: true },
  low: { dpr: [0.8, 1] as [number, number], shadows: false, guests: true, candles: false, labels: false, antialias: false },
};
