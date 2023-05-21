import { RateLimit } from "async-sema";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { PostStatus } from "../types/supabaseTypes";
import { AxiomAPIRequest, Logger } from "next-axiom";
import { Client as QStashClient } from "@upstash/qstash";

export const rateLimiter = RateLimit(1, {
  timeUnit: 1000,
  uniformDistribution: true,
});

export const updateInstagramContainerId = async (
  instagramPostId: string,
  instagramContainerId: string,
  apiEndpoint: string,
  log: Logger
) => {
  try {
    log.info(
      `[${apiEndpoint}][updateInstagramContainerId] Starting updateInstagramContainerId`,
      {
        parameters: {
          instagramPostId,
          status,
        },
      }
    );
    const { error } = await supabaseClient
      .from("InstagramPosts")
      .update({
        instagram_container_id: instagramContainerId,
      })
      .eq("id", instagramPostId);
    if (error) {
      return handleError(
        log,
        `[${apiEndpoint}][updateInstagramContainerId] Error updating Instagram post status`,
        error,
        {
          instagramPostId,
        }
      );
    }
    log.info(
      `[${apiEndpoint}][updateInstagramContainerId] Completed updateInstagramContainerId`,
      {
        parameters: {
          instagramPostId,
        },
      }
    );
    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      `[api/updateInstagramPostStatus] Error updating Instagram post status`,
      error,
      {
        instagramPostId,
      }
    );
  }
};

export const updateInstagramPostStatus = async (
  instagramPostId: string,
  supabaseClient: SupabaseClient,
  status: PostStatus,
  apiEndpoint: string,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[${apiEndpoint}] Starting updateInstagramPostStatus`, {
      parameters: {
        instagramPostId,
        status,
      },
    });
    const { error } = await supabaseClient
      .from("InstagramPosts")
      .update({
        status,
      })
      .eq("id", instagramPostId);
    if (error) throw error;
    req.log.info(`[${apiEndpoint}] Completed updateInstagramPostStatus`, {
      parameters: {
        instagramPostId,
        status,
      },
    });
    return { error: null };
  } catch (error: any) {
    req.log.error(`[${apiEndpoint}] Error on updateInstagramPostStatus`, {
      error: error.message,
      parameters: {
        instagramPostId,
        status,
      },
    });
    return { error };
  }
};

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
