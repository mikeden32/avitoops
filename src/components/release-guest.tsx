"use client";

import { useEffect } from "react";
import { releaseGuestCookies } from "@/server/guest-actions";

export function ReleaseGuest({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    void releaseGuestCookies();
  }, [active]);
  return null;
}
