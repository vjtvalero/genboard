import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    githubLogin?: string;
    user: DefaultSession["user"];
  }

  interface Profile {
    login?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    login?: string;
  }
}
