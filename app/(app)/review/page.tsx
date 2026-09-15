import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getUserByLogin } from "@/lib/users";
import { userCanAccessRepository } from "@/lib/repositories";
import { pendingReviewResults } from "@/lib/results";
import ReviewList from "@/components/review/ReviewList";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const session = await auth();
  const user = session?.githubLogin ? await getUserByLogin(session.githubLogin) : null;
  const selectedRepoCookie = cookies().get("genboard_repo")?.value ?? null;
  const selectedRepo =
    user && selectedRepoCookie && (await userCanAccessRepository(user, selectedRepoCookie))
      ? selectedRepoCookie
      : null;

  if (!selectedRepo) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold">No repository selected</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Pick a repository from the switcher above to see its review queue.
          </p>
        </div>
      </div>
    );
  }

  const items = await pendingReviewResults(selectedRepo);

  return (
    <div className="p-6">
      <ReviewList items={items} repo={selectedRepo} />
    </div>
  );
}
