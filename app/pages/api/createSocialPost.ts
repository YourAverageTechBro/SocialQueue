import { verifySignature } from "@upstash/qstash/nextjs";
import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { NextApiResponse } from "next";
import { handleError, supabaseClient } from "../../utils/utils";
import { PostStatus } from "../../types/supabaseTypes";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(`[api/createSocialPost] Starting createSocialPost endpoint`, {
      body: JSON.stringify(req.body),
    });
    const { publicationDate, instagramAccountId, accessToken, pageId, userId } =
      req.body;

    if (
      !publicationDate ||
      !instagramAccountId ||
      !accessToken ||
      !pageId ||
      !userId
    ) {
      req.log.error("[api/createSocialPost] Invalid request body", {
        publicationDate,
        instagramAccountId,
        accessToken,
        pageId,
        userId,
      });
      res.status(204).end();
    }

    await createSocialPost(
      publicationDate,
      instagramAccountId,
      accessToken,
      pageId,
      userId,
      req.log
    );

    req.log.info(`[api/createSocialPost] Completed createSocialPost endpoint`, {
      body: JSON.stringify(req.body),
    });
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/createSocialPost] Error:", error.message);
    res.status(204).end();
  }
}
export const createSocialPost = async (
  publicationDate: string,
  instagramAccountId: string,
  accessToken: string,
  pageId: string,
  userId: string,
  log: Logger
) => {
  try {
    log.info(`[api/createSocialPost] Starting createSocialPost`, {
      parameters: {
        publicationDate,
        instagramAccountId,
        pageId,
        userId,
      },
    });
    const { error } = await supabaseClient.from("InstagramPosts").insert({
      instagram_account_id: instagramAccountId,
      access_token: accessToken,
      time_to_post: publicationDate,
      notion_page_id: pageId,
      status: PostStatus.QUEUED,
      user_id: userId,
    });

    if (error) {
      return handleError(
        log,
        `[api/createSocialPost] Error creating post in database`,
        error,
        {
          publicationDate,
          instagramAccountId,
          pageId,
          userId,
        }
      );
    }

    log.info(`[api/createSocialPost] Completed createSocialPost`, {
      parameters: {
        publicationDate,
        instagramAccountId,
        pageId,
        userId,
      },
    });
    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      `[api/createSocialPost] Error creating post in database`,
      error,
      {
        publicationDate,
        instagramAccountId,
        pageId,
        userId,
      }
    );
  }
};

// @ts-ignore
export default withAxiom(verifySignature(handler));

export const config = {
  api: {
    bodyParser: false,
  },
};
