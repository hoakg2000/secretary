"use client";

import {
  Calendar,
  CircleUser,
  Brain,
  LayoutDashboard,
  Languages,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Settings,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useAuth } from "@/lib/auth/auth-provider";
import { cn } from "@/lib/utils";

const NAV: { key: string; href: string; icon: LucideIcon }[] = [
  { key: "chat", href: "/chat", icon: MessageSquare },
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "characters", href: "/characters", icon: UsersRound },
  { key: "emails", href: "/emails", icon: Mail },
  { key: "calendar", href: "/calendar", icon: Calendar },
  { key: "finance", href: "/finance", icon: Wallet },
  { key: "memories", href: "/memories", icon: Brain },
  { key: "settings", href: "/settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("main")} className="flex flex-col gap-1 p-2">
      {NAV.map(({ key, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "bg-muted text-foreground",
              !active && "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

function LanguageSwitch() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="w-full justify-start" />}>
        <Languages aria-hidden />
        <span className="sr-only">{t("common.language")}: </span>
        {t(`languages.${locale}`)}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        {routing.locales.map((l) => (
          <DropdownMenuItem key={l} onClick={() => router.replace(pathname, { locale: l })}>
            {t(`languages.${l}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations();
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-4 text-lg font-semibold">{t("app.name")}</div>
      <Separator />
      <div className="flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <Separator />
      <div className="flex flex-col gap-1 p-2">
        <LanguageSwitch />
        <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
          <CircleUser className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate" title={user?.email}>
            <span className="sr-only">{t("common.signedInAs")} </span>
            {user?.email}
          </span>
        </div>
        <Button variant="ghost" className="w-full justify-start" onClick={() => void logout()}>
          <LogOut aria-hidden />
          {t("common.logout")}
        </Button>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true">
      <div className="hidden w-64 flex-col gap-3 border-r p-4 md:flex">
        <Skeleton className="h-6 w-32" />
        {NAV.map((n) => (
          <Skeleton key={n.key} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { status } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return <ShellSkeleton />;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label={t("nav.openMenu")} />}>
              <Menu aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">{t("app.name")}</SheetTitle>
              <SheetDescription className="sr-only">{t("nav.main")}</SheetDescription>
              <SidebarContent onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">{t("app.name")}</span>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
