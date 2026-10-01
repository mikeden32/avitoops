"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useCurator } from "@/components/curator-provider";
import type { DeskRole } from "@/lib/services/sale";

type SpeechResult = { isFinal: boolean; 0?: { transcript: string } };

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: { results: ArrayLike<SpeechResult> }) => void;
  onend: () => void;
  onerror: (event: { error?: string }) => void;
  start: () => void;
  stop: () => void;
};

export function CuratorMark({ live = false, busy = false }: { live?: boolean; busy?: boolean }) {
  const uid = useId().replace(/:/g, "");
  return (
    <span
      className={`relative block size-full overflow-hidden rounded-[22%] bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)] ${busy ? "curator-busy" : ""}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-full">
        <defs>
          <linearGradient id={`${uid}-shell`} x1="32" y1="8" x2="32" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d5dee6" />
          </linearGradient>
          <linearGradient id={`${uid}-visor`} x1="32" y1="24" x2="32" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#243040" />
            <stop offset="1" stopColor="#0c1218" />
          </linearGradient>
          <radialGradient id={`${uid}-eye`} cx="38%" cy="35%" r="70%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.42" stopColor="#7ad7ff" />
            <stop offset="1" stopColor="#0095e0" />
          </radialGradient>
        </defs>
        <path d="M32 6.5v5" stroke="#b7c3ce" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="32" cy="6" r="2" className={live || busy ? "curator-pulse" : undefined} fill="#00aaff" />
        <rect x="9" y="12" width="46" height="46" rx="20" fill={`url(#${uid}-shell)`} />
        <ellipse cx="32" cy="22" rx="13" ry="5" fill="#ffffff" opacity="0.72" />
        <rect x="15" y="25" width="34" height="15" rx="7.5" fill={`url(#${uid}-visor)`} />
        <g className="curator-look">
          <g className="curator-blink">
            <circle cx="26" cy="32.5" r="3.3" fill={`url(#${uid}-eye)`} />
            <circle cx="38" cy="32.5" r="3.3" fill={`url(#${uid}-eye)`} />
          </g>
        </g>
        <path
          className="curator-mouth"
          d="M26.5 46.5c1.7 1.8 3.5 2.7 5.5 2.7s3.8-.9 5.5-2.7"
          fill="none"
          stroke="#00aaff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        d="M15.2 7.3 8.5 14a3.1 3.1 0 0 0 4.4 4.4l7.1-7.1a4.5 4.5 0 0 0-6.4-6.4L6.2 12.3a6 6 0 0 0 8.5 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WaveIcon({ live = false }: { live?: boolean }) {
  const bars = [5, 9, 14, 9, 5];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      {bars.map((height, index) => (
        <rect
          key={height + index}
          x={3.2 + index * 3.8}
          y={(24 - height) / 2}
          width="2.2"
          height={height}
          rx="1.1"
          fill="currentColor"
          className={live ? "voice-bar" : undefined}
          style={live ? { animationDelay: `${index * 0.08}s` } : undefined}
        />
      ))}
    </svg>
  );
}

function recognitionCtor() {
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return host.SpeechRecognition || host.webkitSpeechRecognition;
}

export function VoiceButton({
  className,
  idleLabel = "Микрофон",
  onText,
  onHearing,
  onMiss,
}: {
  className?: string;
  idleLabel?: string;
  onText?: (text: string, final: boolean) => void;
  onHearing?: (value: boolean) => void;
  onMiss?: (note: string) => void;
}) {
  const { sendToCurator, stopVoice } = useCurator();
  const [ready, setReady] = useState(false);
  const [hearing, setHearing] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    setReady(Boolean(recognitionCtor()));
    return () => recRef.current?.stop();
  }, []);

  function finish(value: boolean) {
    setHearing(value);
    onHearing?.(value);
  }

  function listen() {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      onMiss?.("В этом браузере микрофон недоступен. Напишите текст.");
      return;
    }
    stopVoice();
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = false;
    rec.interimResults = true;
    let said = "";
    let quiet = false;
    rec.onresult = (event) => {
      said = Array.from(event.results)
        .map((row) => row[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said) onText?.(said, false);
    };
    rec.onerror = (event) => {
      const reason = event.error ?? "";
      if (reason === "aborted") quiet = true;
      else if (reason === "not-allowed" || reason === "service-not-allowed" || reason === "audio-capture") {
        quiet = true;
        onMiss?.("Разрешите микрофон в браузере или напишите текст.");
      } else if (reason !== "no-speech") {
        quiet = true;
        onMiss?.("Микрофон не сработал. Напишите текст.");
      }
    };
    rec.onend = () => {
      recRef.current = null;
      finish(false);
      const text = said.trim();
      if (text) {
        if (onText) onText(text, true);
        else sendToCurator(text);
        return;
      }
      if (!quiet) onMiss?.("Микрофон не расслышал. Скажите ещё раз или напишите.");
    };
    recRef.current = rec;
    try {
      rec.start();
      finish(true);
    } catch {
      recRef.current = null;
      finish(false);
      onMiss?.("Микрофон не сработал. Напишите текст.");
    }
  }

  return (
    <button
      type="button"
      className={className ?? "rounded-xl px-2 py-1 text-sm font-bold text-white/80 transition hover:bg-white/10 hover:text-white"}
      aria-label={hearing ? "Слушаю" : idleLabel}
      disabled={!ready && !hearing}
      onClick={listen}
    >
      <WaveIcon live={hearing} />
    </button>
  );
}

const ROLES: Array<[DeskRole, string]> = [
  ["copy", "Копирайтер"],
  ["design", "Дизайнер"],
  ["promo", "Менеджер продвижения"],
  ["reply", "Менеджер переписки"],
];

export function RoleLights({ active }: { active: DeskRole | null }) {
  const current = ROLES.find(([id]) => id === active);
  if (!current) return null;
  return <p className="text-xs font-semibold text-muted">{current[1]}</p>;
}
