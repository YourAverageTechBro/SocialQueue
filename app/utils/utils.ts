import { RateLimit } from "async-sema";
import { SupabaseClient } from "@supabase/supabase-js";
import { PostStatus } from "../types/supabaseTypes";
import { AxiomAPIRequest } from "next-axiom";

export const rateLimiter = RateLimit(1, {
  timeUnit: 1000,
  uniformDistribution: true,
});

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
