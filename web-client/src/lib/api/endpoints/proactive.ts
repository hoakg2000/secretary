import { apiFetch } from "../client";
import type { ProactiveTriggerInput, ProactiveTriggerResult } from "../types";

export const triggerProactive = (input: ProactiveTriggerInput) =>
  apiFetch<ProactiveTriggerResult>("/proactive/trigger", { method: "POST", json: input });
