"use client";

import { createContext, useContext, useRef, useState } from "react";
import type { DeskRole } from "@/lib/services/sale";

export type ProfileDraft = {
  company: string;
  phone: string;
  telegram: string;
  avitoPhone: string;
  workMode: "own_cabinet" | "materials_only";
  cities: string;
  categories: string;
  replyRules: string;
  escalateRules: string;
};

type Patch = { key: keyof ProfileDraft; value: string; stamp: number };

type CuratorApi = {
  startIntake: () => void;
  intakeToken: number;
  openChat: () => void;
  openToken: number;
  openTariffFit: () => void;
  fitToken: number;
  patch: Patch | null;
  setField: (key: keyof ProfileDraft, value: string) => void;
  registerSender: (fn: ((text: string) => void) | null) => void;
  sendToCurator: (text: string) => void;
  stopVoice: () => void;
  armVoice: () => void;
  playVoice: (audio: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  lit: DeskRole | null;
  setLit: (value: DeskRole | null) => void;
};

const CuratorContext = createContext<CuratorApi | null>(null);

export function CuratorProvider({ children }: { children: React.ReactNode }) {
  const [intakeToken, setIntakeToken] = useState(0);
  const [openToken, setOpenToken] = useState(0);
  const [fitToken, setFitToken] = useState(0);
  const [patch, setPatch] = useState<Patch | null>(null);
  const [busy, setBusy] = useState(false);
  const [lit, setLit] = useState<DeskRole | null>(null);
  const sender = useRef<((text: string) => void) | null>(null);
  const voice = useRef<HTMLAudioElement | null>(null);
  const voiceUrl = useRef<string | null>(null);

  function voiceNode() {
    if (!voice.current) {
      const node = new Audio();
      node.hidden = true;
      node.setAttribute("data-assistant-voice", "1");
      voice.current = node;
    }
    if (!voice.current.isConnected) document.body.appendChild(voice.current);
    return voice.current;
  }

  function stopVoice() {
    window.speechSynthesis?.cancel();
    const node = voice.current;
    if (!node) return;
    node.pause();
    node.removeAttribute("src");
    if (voiceUrl.current) {
      URL.revokeObjectURL(voiceUrl.current);
      voiceUrl.current = null;
    }
  }

  function armVoice() {
    const node = voiceNode();
    node.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    void node.play().catch(() => undefined);
  }

  function playVoice(audio: string) {
    const node = voiceNode();
    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (voiceUrl.current) URL.revokeObjectURL(voiceUrl.current);
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    voiceUrl.current = url;
    node.pause();
    node.src = url;
    node.onended = () => {
      if (voiceUrl.current === url) {
        URL.revokeObjectURL(url);
        voiceUrl.current = null;
      }
    };
    void node.play().catch(() => undefined);
  }

  function startIntake() {
    setIntakeToken((value) => value + 1);
  }

  function openChat() {
    setOpenToken((value) => value + 1);
  }

  function openTariffFit() {
    setFitToken((value) => value + 1);
  }

  function setField(key: keyof ProfileDraft, value: string) {
    setPatch({ key, value, stamp: Date.now() });
  }

  function registerSender(fn: ((text: string) => void) | null) {
    sender.current = fn;
  }

  function sendToCurator(text: string) {
    stopVoice();
    sender.current?.(text);
  }

  return (
    <CuratorContext.Provider
      value={{
        startIntake,
        intakeToken,
        openChat,
        openToken,
        openTariffFit,
        fitToken,
        patch,
        setField,
        registerSender,
        sendToCurator,
        stopVoice,
        armVoice,
        playVoice,
        busy,
        setBusy,
        lit,
        setLit,
      }}
    >
      {children}
    </CuratorContext.Provider>
  );
}

export function useCurator() {
  const value = useContext(CuratorContext);
  if (!value) throw new Error("Куратор не подключён");
  return value;
}

export function OpenTariffFit({ children, className }: { children: React.ReactNode; className?: string }) {
  const { openTariffFit } = useCurator();
  return (
    <button type="button" className={className} onClick={openTariffFit}>
      {children}
    </button>
  );
}

export function OpenCuratorButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { openChat } = useCurator();
  return (
    <button type="button" className={className} onClick={openChat}>
      {children}
    </button>
  );
}
