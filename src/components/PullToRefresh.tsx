"use client";

import { useEffect, useRef, useState } from "react";

const ACTIVATION_DISTANCE = 42;
const TRIGGER_DISTANCE = 140;
const MIN_PULL_DURATION_MS = 450;

function isInsideModal(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('[data-modal-root="true"], [role="dialog"]');
}

function getMainScroller() {
  return document.querySelector("main") as HTMLElement | null;
}

function getScrollTop() {
  const main = getMainScroller();
  const mainCanScroll = !!main && main.scrollHeight > main.clientHeight + 1;
  const mainScrollTop = mainCanScroll ? main.scrollTop : 0;
  const documentScrollTop =
    window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

  return Math.max(mainScrollTop, documentScrollTop);
}

function isAtPageTop() {
  return getScrollTop() <= 1;
}

export default function PullToRefresh() {
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const rawDistanceRef = useRef(0);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [distance, setDistanceState] = useState(0);
  const [refreshing, setRefreshingState] = useState(false);

  const setDistance = (value: number) => {
    distanceRef.current = value;
    setDistanceState(value);
  };

  const resetPull = () => {
    pullingRef.current = false;
    startYRef.current = null;
    startTimeRef.current = null;
    rawDistanceRef.current = 0;
    setDistance(0);
  };

  const setRefreshing = (value: boolean) => {
    refreshingRef.current = value;
    setRefreshingState(value);
  };

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      if (isInsideModal(event.target) || event.touches.length !== 1 || !isAtPageTop()) {
        resetPull();
        return;
      }

      startYRef.current = event.touches[0].clientY;
      startTimeRef.current = Date.now();
      rawDistanceRef.current = 0;
      pullingRef.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || startYRef.current === null || refreshingRef.current) return;
      if (isInsideModal(event.target) || !isAtPageTop()) {
        resetPull();
        return;
      }

      const currentY = event.touches[0].clientY;
      const rawDiff = currentY - startYRef.current;
      rawDistanceRef.current = Math.max(0, rawDiff);

      if (rawDiff <= 0) {
        setDistance(0);
        return;
      }

      if (rawDiff < ACTIVATION_DISTANCE) {
        setDistance(0);
        return;
      }

      event.preventDefault();
      setDistance(Math.min((rawDiff - ACTIVATION_DISTANCE) * 0.45, 120));
    };

    const handleTouchEnd = () => {
      if (!pullingRef.current) return;

      const pullDuration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      const shouldRefresh =
        isAtPageTop() &&
        rawDistanceRef.current >= TRIGGER_DISTANCE &&
        pullDuration >= MIN_PULL_DURATION_MS;

      pullingRef.current = false;
      startYRef.current = null;
      startTimeRef.current = null;
      rawDistanceRef.current = 0;

      if (shouldRefresh) {
        setRefreshing(true);
        setDistance(TRIGGER_DISTANCE - ACTIVATION_DISTANCE);
        window.location.reload();
        return;
      }

      setDistance(0);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  const visible = distance > 0 || refreshing;

  return (
    <div
      className={`fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[1080] -translate-x-1/2 transition-all duration-150 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ transform: `translate(-50%, ${Math.max(0, distance - 50)}px)` }}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-2 rounded-full bg-stone-950/90 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
        <span className={`inline-block ${refreshing ? "animate-spin" : ""}`}>↻</span>
        <span>{refreshing ? "Actualisation..." : rawDistanceRef.current >= TRIGGER_DISTANCE ? "Relâcher pour actualiser" : "Tirer plus longtemps"}</span>
      </div>
    </div>
  );
}
