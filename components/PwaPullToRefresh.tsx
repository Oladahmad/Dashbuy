"use client";

import { useEffect, useRef, useState } from "react";

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return iosStandalone || displayModeStandalone;
}

export default function PwaPullToRefresh() {
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const thresholdReachedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const touchCapable = "ontouchstart" in window;
    setEnabled(isStandalonePwa() && touchCapable);
  }, []);

  useEffect(() => {
    if (!enabled || refreshing) return;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      if (e.touches.length !== 1) return;
      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
      thresholdReachedRef.current = false;
      setPull(0);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activeRef.current || startYRef.current === null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0 || window.scrollY > 0) return;

      const nextPull = Math.min(120, dy * 0.5);
      thresholdReachedRef.current = nextPull >= 72;
      setPull(nextPull);
      e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      startYRef.current = null;

      if (thresholdReachedRef.current) {
        setRefreshing(true);
        setPull(80);
        // Keep a short hold so the refresh interaction feels intentional.
        window.setTimeout(() => {
          window.location.reload();
        }, 900);
        return;
      }

      thresholdReachedRef.current = false;
      setPull(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, refreshing]);

  if (!enabled) return null;

  const rotation = refreshing ? 720 : Math.min(180, pull * 2.4);
  const showPrompt = pull > 8 || refreshing;
  const releaseReady = pull >= 72;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[100] flex justify-center"
      style={{
        transform: `translateY(${pull > 0 ? 0 : -80}px)`,
        transition: pull > 0 ? "none" : "transform 180ms ease",
      }}
      aria-hidden
    >
      <div className="mt-2 flex min-h-11 items-center gap-2 rounded-full border border-black/20 bg-white px-3 text-black shadow-sm">
        <svg
          viewBox="0 0 24 24"
          className={refreshing ? "animate-spin" : ""}
          style={{ width: 20, height: 20, transform: refreshing ? undefined : `rotate(${rotation}deg)` }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        {showPrompt ? (
          <span className="text-xs font-medium">
            {refreshing ? "Refreshing..." : releaseReady ? "Release to refresh" : "Pull to refresh"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
