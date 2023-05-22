import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { createClient } from "@supabase/supabase-js";
import { PostStatus } from "../../types/supabaseTypes";
import { Client } from "@upstash/qstash";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(
      `[api/pollSocialPosts] Starting pollSocialPosts function ${req.query.apiKey}`
    );

    const { apiKey } = req.query;
    if (apiKey !== process.env.API_KEY) {
      req.log.error("[api/pollSocialPosts] Invalid API key");
      throw Error("Invalid API key");
    }

    const lowerBoundTime = getLowerBoundTime();
    const upperBoundTime = getUpperBoundTime();
    req.log.info(
      `[api/pollSocialPosts] Querying data with the following timestamps: ${JSON.stringify(
        {
          lowerBound: lowerBoundTime,
          upperBound: upperBoundTime,
        }
      )}
      `
    );
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default when deployed.
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );
    const { data, error } = await supabaseClient
      .from("InstagramPosts")
      .select("*")
      .lte("time_to_post", upperBoundTime)
      .gte("time_to_post", lowerBoundTime)
      .eq("status", PostStatus.QUEUED);

    req.log.info(`[api/pollSocialPosts] Fetched queued posts from Supabase`, {
      data: JSON.stringify(data),
    });

    if (error) throw error;
    const c = new Client({
      token: process.env.QSTASH_TOKEN ?? "",
    });
    await Promise.all(
      data.map(async (post) => {
        const id = post.id.toString();
        if (!id) {
          throw Error("[api/pollSocialPosts] Post id not found");
        }
        const res = await c.publishJSON({
          url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/notionPage`,
          // or topic: "the name or id of a topic"
          body: {
            post,
            userId: post.user_id,
          },
        });
        req.log.info(`[api/pollSocialPosts] post ${res.messageId} published.`);
      })
    );

    req.log.info(`[api/pollSocialPosts] Completed pollSocialPosts`);
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/pollSocialPosts] Error: ", error.message);
    res.status(204).end();
  }
}
const getUpperBoundTime = (date = new Date()) => {
  const minutes = 1;
  const ms = 1000 * 60 * minutes;
  return new Date(Math.floor(date.getTime() / ms) * ms).toISOString();
};

const getLowerBoundTime = (date: Date = new Date()) => {
  const minutes = 5;
  return new Date(date.getTime() - minutes * 60000).toISOString();
};

export default withAxiom(handler);
