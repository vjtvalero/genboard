import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * NextAuth v5 (beta) config — single-user GitHub OAuth.
 *
 * We use the JWT session strategy (no DB adapter) so that the GitHub
 * `access_token` is easy to surface on the session for Octokit calls. The
 * `repo` scope is required to list private repos and push.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
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
    // Persist the GitHub access token + login onto the JWT.
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile?.login) {
        token.login = profile.login as string;
      }
      return token;
    },
    // Surface access token + GitHub login on the session.
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.githubLogin = token.login as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
