import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getUserByLogin, isUserRole, upsertGitHubUser } from "@/lib/users";

/**
 * NextAuth v5 (beta) config — GitHub OAuth with app-local users/roles.
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
    // Persist the GitHub access token + local user identity onto the JWT.
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile?.login) {
        const user = await upsertGitHubUser({
          githubId: profile.id ? String(profile.id) : null,
          githubLogin: profile.login as string,
          email: typeof profile.email === "string" ? profile.email : null,
          name: typeof profile.name === "string" ? profile.name : null,
          avatarUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
        });
        token.login = user.githubLogin;
        token.userId = user.id;
        token.role = isUserRole(user.role) ? user.role : "pm";
      } else if (typeof token.login === "string") {
        const user = await getUserByLogin(token.login) ?? await upsertGitHubUser({
          githubLogin: token.login,
          email: typeof token.email === "string" ? token.email : null,
          name: typeof token.name === "string" ? token.name : null,
          avatarUrl: typeof token.picture === "string" ? token.picture : null,
        });
        token.userId = user.id;
        token.role = isUserRole(user.role) ? user.role : "pm";
      }
      return token;
    },
    // Surface access token + local user role on the session.
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.githubLogin = token.login as string | undefined;
      if (typeof token.userId === "string") session.userId = token.userId;
      if (isUserRole(token.role)) session.role = token.role;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
