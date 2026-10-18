import { ApiError } from "@/lib/api/client";

/** Server messages are shown as received; anything else gets the fallback. */
export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.status !== 0 ? error.message : fallback;
