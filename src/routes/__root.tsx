import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
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
      { title: "ALPHA" },
      { name: "description", content: "ALPHA" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "ALPHA" },
      { property: "og:description", content: "ALPHA" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "ALPHA" },
      { name: "twitter:description", content: "ALPHA" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0ad08c3d-9261-4e49-a86e-cc17780c3878/id-preview-87f5214a--7b2132a4-7e9c-4ef4-88ba-0c31e79bc369.lovable.app-1784435575668.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0ad08c3d-9261-4e49-a86e-cc17780c3878/id-preview-87f5214a--7b2132a4-7e9c-4ef4-88ba-0c31e79bc369.lovable.app-1784435575668.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // The inline theme script below mutates data-theme / inline CSS vars before
    // hydration, so the client HTML intentionally differs from the SSR output.
    <html lang="en" data-theme="graphite" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;var t=localStorage.getItem('alpha-theme');if(t)d.setAttribute('data-theme',t);var x=localStorage.getItem('alpha-theme-hex');if(x&&/^#[0-9a-f]{6}$/i.test(x)){var f=function(v){v=parseInt(v,16)/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)};var r=f(x.slice(1,3)),g=f(x.slice(3,5)),b=f(x.slice(5,7));var l_=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b),m_=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b),s_=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);var L=0.2104542553*l_+0.793617785*m_-0.0040720468*s_,A=1.9779984951*l_-2.428592205*m_+0.4505937099*s_,B=0.0259040371*l_+0.7827717662*m_-0.808675766*s_;var C=Math.min(0.37,Math.sqrt(A*A+B*B)),H=Math.atan2(B,A)*180/Math.PI;if(H<0)H+=360;L=Math.min(0.99,Math.max(0.04,L));var br=L>0.62;d.style.setProperty('--th-h',H.toFixed(2));d.style.setProperty('--th-c',C.toFixed(4));d.style.setProperty('--th-l',L.toFixed(4));d.style.setProperty('--th-fg',br?'oklch(0.15 0.02 '+H.toFixed(2)+')':'oklch(0.99 0.01 '+H.toFixed(2)+')');d.style.setProperty('--th-fg-dim',br?'oklch(0.25 0.02 '+H.toFixed(2)+' / 70%)':'oklch(0.99 0.01 '+H.toFixed(2)+' / 68%)');d.style.setProperty('--th-line',br?'oklch(0 0 0 / 14%)':'oklch(1 0 0 / 14%)');}}catch(e){}`,
          }}
        />
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

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
