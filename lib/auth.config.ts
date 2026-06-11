import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import type { UserRole } from "@/types";

/**
 * Edge-safe NextAuth config shared by `middleware.ts` (Edge Runtime) and the
 * full Node-runtime config in `lib/auth.ts`.
 *
 * IMPORTANT: nothing here may import Prisma (`lib/db`/`lib/users`). The
 * middleware bundle runs in the Edge Runtime, where Prisma Client cannot
 * execute. The Prisma-touching `jwt` callback lives only in `lib/auth.ts`.
 */
const ROLES: UserRole[] = ["pm", "se", "admin"];

export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: { scope: "read:user user:email repo" },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Surface access token + local user identity on the session. Reads only
    // fields already minted onto the JWT (no DB access), so it is edge-safe.
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.githubLogin = token.login as string | undefined;
      if (typeof token.userId === "string") session.userId = token.userId;
      if (typeof token.role === "string" && ROLES.includes(token.role as UserRole)) {
        session.role = token.role as UserRole;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
