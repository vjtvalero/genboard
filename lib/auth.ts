import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { getUserByLogin, isUserRole, upsertGitHubUser } from "@/lib/users";

/**
 * NextAuth v5 (beta) config — GitHub OAuth with app-local users/roles.
 *
 * Runs in the Node runtime (route handlers via `handlers`, server-side `auth()`
 * calls) so the `jwt` callback below can touch Prisma. Middleware uses the
 * edge-safe `authConfig` directly and must NOT import this module.
 *
 * JWT session strategy (no DB adapter) keeps the GitHub `access_token` easy to
 * surface on the session for Octokit calls; the `repo` scope is required to
 * list private repos and push.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Persist the GitHub access token + local user identity onto the JWT.
    // Touches Prisma, so this only runs in the Node runtime.
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
  },
});
