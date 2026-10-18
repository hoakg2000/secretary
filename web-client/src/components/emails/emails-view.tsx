"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailLogs } from "./email-logs";
import { EmailRules } from "./email-rules";

export function EmailsView() {
  const t = useTranslations("emails");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">{t("tabLogs")}</TabsTrigger>
          <TabsTrigger value="rules">{t("tabRules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="pt-3">
          <EmailLogs />
        </TabsContent>
        <TabsContent value="rules" className="pt-3">
          <EmailRules />
        </TabsContent>
      </Tabs>
    </div>
  );
}
