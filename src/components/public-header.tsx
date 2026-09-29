import { auth, signOut } from "@/auth";
import { SiteHeader } from "./site-header";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export async function PublicHeader() {
  const session = await auth();
  const role = session?.user?.role;
  return (
    <SiteHeader
      signedIn={Boolean(session?.user)}
      cabinetHref={role === "admin" ? "/admin" : "/app"}
      signOutAction={signOutAction}
    />
  );
}
