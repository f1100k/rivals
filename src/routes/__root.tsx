import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";
import { SiteCountdown } from "@/components/SiteCountdown";
import { PromoRotator } from "@/components/PromoRotator";
import { PlayerVideoInbox } from "@/components/PlayerVideoInbox";
import { HalloweenBackground } from "@/components/HalloweenBackground";
import { NameFontFaces } from "@/components/NameFonts";
import { REPORT_PROBLEM_URL } from "@/lib/links";

import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "../components/SiteNav";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Inhouse Rematch" },
      { name: "description", content: "Fila in-house para partidas competitivas de Rematch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      ...(import.meta.env["VITE_LOCAL_OFFLINE"] === "1"
        ? [{ rel: "stylesheet", href: "/__local-fonts/fonts.css" }]
        : [
            { rel: "preconnect", href: "https://fonts.googleapis.com" },
            { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Chakra+Petch:wght@500;700&display=swap" },
          ]),
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <HalloweenBackground />
      <NameFontFaces />
      <SiteNav />
      {/* Phones: countdown + promo sit in a strip under the header so they never cover buttons.
          From sm up the wrapper disappears (contents) and both widgets float in the corners. */}
      <div className="mx-auto flex max-w-6xl items-stretch gap-2 px-3 pt-3 empty:hidden sm:contents">
        <SiteCountdown />
        <PromoRotator />
      </div>
      <Outlet />
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 pb-8 pt-4 text-xs sm:pb-8 text-muted-foreground">
        <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
        <Link to="/termos" className="hover:text-foreground">Termos de Uso</Link>
        <Link to="/doacao" className="hover:text-foreground">Doação</Link>
        <a
          href={REPORT_PROBLEM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          Reportar problema
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </a>
      </footer>
      <Toaster />
      <AnnouncementPopup />
      <PlayerVideoInbox />
    </QueryClientProvider>
  );
}
