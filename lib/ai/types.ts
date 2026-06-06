// Re-export the provider contract from the shared types module so callers can
// import from either location.
export type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIReview,
  AIReviewRequest,
  AIReviewFinding,
  FileContext,
  FilePatch,
} from "@/types";
