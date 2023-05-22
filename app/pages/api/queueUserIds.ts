import { Client } from "@upstash/qstash";
import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { createClient } from "@supabase/supabase-js";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(`[api/queueUserIds] Starting queueUserIds`, {
      query: JSON.stringify(req.query),
    });

    const { apiKey } = req.query;
    if (apiKey !== process.env.API_KEY) {
      req.log.error("[api/queueUserIds] Invalid API key");
      throw Error("Invalid API key");
    }

    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default when deployed.
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );
    const { data, error } = await supabaseClient.from("Users").select("id");
    req.log.info(
      `[api/queueUserIds] Successfully fetched data from Supabase: ${JSON.stringify(
        data
      )}`
    );
    if (error) throw error;

    const fiveMinutesBeforeCurrentDate = new Date(
      Date.now() - 1000 * (60 * 5)
    ).toISOString();
    const c = new Client({
      token: process.env.QSTASH_TOKEN ?? "",
    });
    await Promise.all(
      data.map(async (entry) => {
        const id = entry.id;
        if (!id) throw Error("User id not found");
        const res = await c.publishJSON({
          url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/queueUserPosts?apiKey=${process.env.API_KEY}`,
          // or topic: "the name or id of a topic"
          body: {
            userId: id,
            timestamp: fiveMinutesBeforeCurrentDate,
          },
        });
        req.log.info(
          `[api/queueUserIds] message ${
            res.messageId
          } published with data ${JSON.stringify({
            userId: id,
            timestamp: fiveMinutesBeforeCurrentDate,
          })}`
        );
      })
    );
    req.log.info(`[api/queueUserIds] Completed queueUserIds`);
    res.status(204).end();
  } catch (error: any) {
    req.log.error(`[api/queueUserIds] Error ${error.message}`);
    res.status(500).json({ data: "BAD" });
  }
}

export default withAxiom(handler);
