import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { createClient } from "@supabase/supabase-js";
import { Logger } from "next-axiom";
import { Client as QStashClient } from "@upstash/qstash";

export const handleError = (
  log: Logger,
  errorMessagePrefix: string,
  error: any,
  parameters: Record<string, any>
) => {
  log.error(errorMessagePrefix, {
    error: error.message,
    parameters,
  });
  return { data: null, error };
};

export const qStashClient = new QStashClient({
  token: process.env.QSTASH_TOKEN ?? "",
});

export const supabaseClient = createClient(
  // Supabase API URL - env var exported by default when deployed.
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
);

const redis = Redis.fromEnv();

export const rateLimit = {
  notionApi: new Ratelimit({
    redis,
    analytics: true,
    prefix: "rateLimit:notionApi",
    limiter: Ratelimit.slidingWindow(3, "1s"),
  }),
  instagramContentPublish: new Ratelimit({
    redis,
    analytics: true,
    prefix: "rateLimit:instagramContentPublish",
    limiter: Ratelimit.slidingWindow(25, "1d"),
  }),
};
