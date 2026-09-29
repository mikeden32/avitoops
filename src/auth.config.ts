import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const loggedIn = Boolean(auth?.user);
      const role = auth?.user?.role;
      if (path.startsWith("/admin")) {
        if (!loggedIn) return false;
        if (role !== "admin") return NextResponse.redirect(new URL("/app", request.nextUrl));
        return true;
      }
      if (path.startsWith("/app")) return loggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.id === "string" ? token.id : "";
      session.user.role = token.role === "admin" ? "admin" : "client";
      return session;
    },
  },
} satisfies NextAuthConfig;
