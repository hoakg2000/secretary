"use client";

import { useTranslations } from "next-intl";

/** Placeholder for pages that later runs will build. `navKey` is a key under `nav` in the messages. */
export function ComingSoon({ navKey }: { navKey: string }) {
  const t = useTranslations();
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t(`nav.${navKey}`)}</h1>
      <p className="mt-2 text-muted-foreground">
        {t("common.comingSoon")}. {t("common.comingSoonHint")}
      </p>
    </section>
  );
}
