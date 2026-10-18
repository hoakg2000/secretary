"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accounts } from "./accounts";
import { Categories } from "./categories";
import { Overview } from "./overview";
import { Transactions } from "./transactions";

export function FinanceView() {
  const t = useTranslations("finance");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("tabOverview")}</TabsTrigger>
          <TabsTrigger value="transactions">{t("tabTransactions")}</TabsTrigger>
          <TabsTrigger value="accounts">{t("tabAccounts")}</TabsTrigger>
          <TabsTrigger value="categories">{t("tabCategories")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-3">
          <Overview />
        </TabsContent>
        <TabsContent value="transactions" className="pt-3">
          <Transactions />
        </TabsContent>
        <TabsContent value="accounts" className="pt-3">
          <Accounts />
        </TabsContent>
        <TabsContent value="categories" className="pt-3">
          <Categories />
        </TabsContent>
      </Tabs>
    </div>
  );
}
