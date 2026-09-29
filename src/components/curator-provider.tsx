"use client";

import { createContext, useContext, useState } from "react";

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
  patch: Patch | null;
  setField: (key: keyof ProfileDraft, value: string) => void;
};

const CuratorContext = createContext<CuratorApi | null>(null);

export function CuratorProvider({ children }: { children: React.ReactNode }) {
  const [intakeToken, setIntakeToken] = useState(0);
  const [patch, setPatch] = useState<Patch | null>(null);

  function startIntake() {
    setIntakeToken((value) => value + 1);
  }

  function setField(key: keyof ProfileDraft, value: string) {
    setPatch({ key, value, stamp: Date.now() });
  }

  return (
    <CuratorContext.Provider value={{ startIntake, intakeToken, patch, setField }}>{children}</CuratorContext.Provider>
  );
}

export function useCurator() {
  const value = useContext(CuratorContext);
  if (!value) throw new Error("Куратор не подключён");
  return value;
}
