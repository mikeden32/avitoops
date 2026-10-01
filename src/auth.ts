import { cookies } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Mailru from "next-auth/providers/mailru";
import Vk from "next-auth/providers/vk";
import Yandex from "next-auth/providers/yandex";
import { authConfig } from "./auth.config";
import { socialConfigured } from "./lib/social-auth";
import { ensureOAuthClient, verifyUser } from "./lib/services/users";

function oauthProviders() {
  const list = [];
  if (socialConfigured("yandex")) {
    list.push(Yandex({ clientId: process.env.AUTH_YANDEX_ID, clientSecret: process.env.AUTH_YANDEX_SECRET }));
  }
  if (socialConfigured("google")) {
    list.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
  }
  if (socialConfigured("vk")) {
    list.push(Vk({ clientId: process.env.AUTH_VK_ID, clientSecret: process.env.AUTH_VK_SECRET }));
  }
  if (socialConfigured("mailru")) {
    list.push(Mailru({ clientId: process.env.AUTH_MAILRU_ID, clientSecret: process.env.AUTH_MAILRU_SECRET }));
  }
  return list;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...oauthProviders(),
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await verifyUser(email, password);
        if (!user) return null;
        return { id: user.id, email: user.email, role: user.role, name: user.email };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;
      return Boolean(user.email);
    },
    async jwt({ token, user, account }) {
      if (user && (!account || account.provider === "credentials")) {
        token.id = user.id ?? "";
        token.role = user.role;
        return token;
      }
      if (account && account.provider !== "credentials" && user?.email) {
        const jar = await cookies();
        const plan = jar.get("avitoops-join-plan")?.value ?? null;
        jar.delete("avitoops-join-plan");
        const dbUser = await ensureOAuthClient(user.email, plan);
        token.id = dbUser.id;
        token.role = dbUser.role;
      }
      return token;
    },
  },
});
