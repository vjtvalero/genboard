import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/types";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    githubLogin?: string;
    userId?: string;
    role?: UserRole;
    user: DefaultSession["user"];
  }

  interface Profile {
    login?: string;
    avatar_url?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    login?: string;
    userId?: string;
    role?: UserRole;
  }
}
