"use server";

import { cookies } from "next/headers";

const names = ["avitoops-guest", "avitoops-sale"] as const;

export async function releaseGuestCookies() {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  for (const name of names) {
    if (!jar.get(name)) continue;
    jar.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: 0,
    });
  }
}
