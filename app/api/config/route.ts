import { getSession, unauthorized, json } from "@/lib/api";
import { availableProviders } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

// GET /api/config — non-secret runtime config for the Settings page.
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  return json({
    available: availableProviders(),
    limits: {
      maxFiles: Number(process.env.GENBOARD_MAX_FILES ?? 400),
      maxFileBytes: Number(process.env.GENBOARD_MAX_FILE_BYTES ?? 100_000),
      maxTotalBytes: Number(process.env.GENBOARD_MAX_TOTAL_BYTES ?? 2_000_000),
    },
  });
}
