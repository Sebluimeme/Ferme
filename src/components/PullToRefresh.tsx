"use client";

import { useEffect, useRef, useState } from "react";

const TRIGGER_DISTANCE = 82;

function isInsideModal(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('[data-modal-root="true"], [role="dialog"]');
}

export default function PullToRefresh() {
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [distance, setDistanceState] = useState(0);
  const [refreshing, setRefreshingState] = useState(false);

  const setDistance = (value: number) => {
    distanceRef.current = value;
    setDistanceState(value);
  };

  const setRefreshing = (value: boolean) => {
    refreshingRef.current = value;
    setRefreshingState(value);
  };

  useEffect(() => {
    const getMainScroller = () => document.querySelector("main") as HTMLElement | null;

    const handleTouchStart = (event: TouchEvent) => {
      if (isInsideModal(event.target)) return;
      const scroller = getMainScroller();
      const scrollTop = scroller?.scrollTop ?? window.scrollY;
      if (scrollTop <= 0 && event.touches.length === 1) {
        startYRef.current = event.touches[0].clientY;
        pullingRef.current = true;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || startYRef.current === null || refreshingRef.current) return;
      if (isInsideModal(event.target)) {
        pullingRef.current = false;
        setDistance(0);
        return;
      }

      const currentY = event.touches[0].clientY;
      const diff = currentY - startYRef.current;
      if (diff <= 0) {
        setDistance(0);
        return;
      }

      const scroller = getMainScroller();
      const scrollTop = scroller?.scrollTop ?? window.scrollY;
      if (scrollTop > 0) {
        pullingRef.current = false;
        setDistance(0);
        return;
      }

      event.preventDefault();
      setDistance(Math.min(diff * 0.5, 110));
    };

    const handleTouchEnd = () => {
      if (!pullingRef.current) return;
      const shouldRefresh = distanceRef.current >= TRIGGER_DISTANCE;
      pullingRef.current = false;
      startYRef.current = null;

      if (shouldRefresh) {
        setRefreshing(true);
        setDistance(TRIGGER_DISTANCE);
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
        <span>{refreshing ? "Actualisation..." : distance >= TRIGGER_DISTANCE ? "Relâcher pour actualiser" : "Tirer pour actualiser"}</span>
      </div>
    </div>
  );
}
