import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "client" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    role: "client" | "admin";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "client" | "admin";
  }
}
