import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { EmailStatus } from "@/lib/api/types";

export const EMAIL_STATUSES: EmailStatus[] = ["PENDING", "PROCESSED", "SKIPPED", "FAILED"];

const VARIANT = {
  PENDING: "secondary",
  PROCESSED: "default",
  SKIPPED: "outline",
  FAILED: "destructive",
} as const;

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const t = useTranslations("emails.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
