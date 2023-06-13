import { GoogleOAuthProvider } from "@react-oauth/google";
import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Analytics } from "@vercel/analytics/react";
import { createBrowserSupabaseClient } from "@supabase/auth-helpers-nextjs";
import { Session, SessionContextProvider } from "@supabase/auth-helpers-react";
import { useEffect, useState } from "react";
import { initFacebookSdk } from "../utils/facebookSdk";
import { Toaster } from "react-hot-toast";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useRouter } from "next/router";

// Check that PostHog is client-side (used to handle Next.js SSR)
if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "", {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug();
    },
  });
}

function App({
  Component,
  pageProps,
}: AppProps<{
  initialSession: Session;
}>) {
  const router = useRouter();
  // Create a new supabase browser client on every first render.
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());

  useEffect(() => {
    initFacebookSdk();
  });

  useEffect(() => {
    // Track page views
    const handleRouteChange = () => posthog?.capture("$pageview");
    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, []);

  return (
    <GoogleOAuthProvider
      clientId={process.env.NEXT_PUBLIC_YOUTUBE_OAUTH_CLIENT_KEY ?? ""}
    >
      <SessionContextProvider
        supabaseClient={supabaseClient}
        initialSession={pageProps.initialSession}
      >
        <PostHogProvider client={posthog}>
        <Component {...pageProps} />
        <Analytics />
        <Toaster />
        </PostHogProvider>
      </SessionContextProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
export { reportWebVitals } from "next-axiom";
