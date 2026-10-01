"use client";

import { useEffect, useId, useRef, useState } from "react";

export type OpsState = "idle" | "listening" | "thinking" | "working" | "success" | "error" | "attention";

export function OpsAssistant({ state = "idle", calm = false }: { state?: OpsState; calm?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLSpanElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const markTimer = useRef(0);
  const [mark, setMark] = useState(false);

  useEffect(() => {
    if (state !== "success") return;
    setMark(true);
    window.clearTimeout(markTimer.current);
    markTimer.current = window.setTimeout(() => setMark(false), 3000);
  }, [state]);

  useEffect(() => () => window.clearTimeout(markTimer.current), []);

  useEffect(() => {
    const root = rootRef.current;
    const face = faceRef.current;
    if (!root || !face) return;
    const node = root;
    const faceNode = face;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    function onMove(event: MouseEvent) {
      const rect = node.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1);
      x = Math.max(-1, Math.min(1, dx)) * 4;
      y = Math.max(-1, Math.min(1, dy)) * 3;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        faceNode.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        frame = 0;
      });
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <span ref={rootRef} className={`ops-figure relative block size-full ${calm ? "ops-calm" : ""}`} data-state={state}>
      <span className="ops-body relative block size-full">
        {state === "listening" ? (
          <span className="ops-wave pointer-events-none absolute inset-0 rounded-full border border-[#00aaff]/50" />
        ) : null}
        <svg viewBox="0 0 64 64" aria-hidden="true" className="size-full overflow-visible">
          <defs>
            <radialGradient id={`${uid}-body`} cx="38%" cy="32%" r="68%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.55" stopColor="#e7eef4" />
              <stop offset="1" stopColor="#c5d2de" />
            </radialGradient>
            <radialGradient id={`${uid}-face`} cx="50%" cy="42%" r="62%">
              <stop offset="0" stopColor="#1c3144" />
              <stop offset="1" stopColor="#0d1822" />
            </radialGradient>
            <radialGradient id={`${uid}-eye`} cx="35%" cy="35%" r="70%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#7ad7ff" />
              <stop offset="1" stopColor="#0095e0" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="58" rx="16" ry="3.2" fill="#141414" opacity="0.08" />
          <circle cx="32" cy="30" r="22" fill={`url(#${uid}-body)`} />
          <ellipse cx="26" cy="22" rx="10" ry="6" fill="#ffffff" opacity="0.55" />
          <g ref={faceRef}>
            <circle cx="32" cy="32" r="11" fill={`url(#${uid}-face)`} />
            <g className="ops-blink">
              <circle cx="28" cy="32" r="2.1" fill={`url(#${uid}-eye)`} />
              <circle cx="36" cy="32" r="2.1" fill={`url(#${uid}-eye)`} />
            </g>
          </g>
          {state === "thinking" ? (
            <g className="ops-orbit">
              <circle cx="32" cy="8" r="1.6" fill="#00aaff" />
              <circle cx="50" cy="18" r="1.2" fill="#0084c7" />
            </g>
          ) : null}
        </svg>
        {mark ? (
          <span
            data-ops-mark=""
            className="absolute top-[10%] right-[8%] grid size-6 place-items-center rounded-full bg-[#0b7a3b] text-white shadow-[0_4px_10px_rgba(11,122,59,0.35)]"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
              <path d="M3.5 8.2 6.4 11.1 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
      </span>
    </span>
  );
}
