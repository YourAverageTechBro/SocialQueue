import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { PostStatus } from "../../types/supabaseTypes";
import { qStashClient, supabaseClient } from "../../utils/utils";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(
      `[api/pollInstagramContainers] Starting pollInstagramContainers`
    );

    const { apiKey } = req.query;
    if (apiKey !== process.env.API_KEY) {
      req.log.error("[api/pollInstagramContainers] Invalid API key");
      res.status(204).end();
    }
    const { data, error } = await supabaseClient
      .from("InstagramPosts")
      .select(
        `access_token, id, instagram_account_id, instagram_container_id, notion_page_id,
        Users(notion_access_token)`
      )
      .eq("status", PostStatus.PROCESSING)
      .neq("instagram_container_id", null);

    if (error) {
      req.log.error("[api/pollInstagramContainers] Error: ", {
        error: error.message,
      });
      res.status(204).end();
      return;
    }

    if (!data) {
      req.log.info("[api/pollInstagramContainers] No data found");
      res.status(204).end();
      return;
    }

    await Promise.all(
      data.map(async (post) => {
        const instagramContainerId = post.instagram_container_id;
        const facebookAccessToken = post.access_token;

        const user = post.Users;
        let notionAccessToken = "";
        if (!user) return;
        if (Array.isArray(user)) {
          notionAccessToken = user[0].notion_access_token;
        } else {
          notionAccessToken = user.notion_access_token;
        }
        if (!notionAccessToken) return;

        const notionPageId = post.notion_page_id;
        const postId = post.id;
        const userId = post.instagram_account_id;
        if (!instagramContainerId) {
          throw Error(
            "[api/pollInstagramContainers] Instagram container id not found"
          );
        }
        const res = await qStashClient.publishJSON({
          url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/publishInstagramContainer?apiKey=${process.env.API_KEY}`,
          // or topic: "the name or id of a topic"
          body: {
            instagramContainerId,
            userId,
            facebookAccessToken,
            notionAccessToken,
            notionPageId,
            postId,
          },
          retries: 0,
        });
        req.log.info(
          `[api/pollInstagramContainers] ${res.messageId} published.`
        );
      })
    );

    req.log.info(
      `[api/pollInstagramContainers] Completed pollInstagramContainers`
    );
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/pollInstagramContainers] Error: ", error.message);
    res.status(204).end();
  }
}

export default withAxiom(handler);
