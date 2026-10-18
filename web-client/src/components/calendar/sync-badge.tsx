import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { SyncStatus } from "@/lib/api/types";

const VARIANT = { SYNCED: "default", DIRTY: "secondary", CONFLICT: "destructive" } as const;

export function SyncBadge({ status }: { status: SyncStatus }) {
  const t = useTranslations("calendar.sync");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
