import { verifySignature } from "@upstash/qstash/nextjs";
import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { NextApiResponse } from "next";
import { handleError, supabaseClient } from "../../utils/utils";
import { PostStatus } from "../../types/supabaseTypes";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(`[api/updateSocialPost] Starting updateSocialPost endpoint`, {
      body: JSON.stringify(req.body),
    });
    const {
      publicationDate,
      instagramAccountId,
      accessToken,
      pageId,
      userId,
      postId,
    } = req.body;

    if (
      !publicationDate ||
      !instagramAccountId ||
      !accessToken ||
      !pageId ||
      !userId ||
      !postId
    ) {
      req.log.error("[api/updateSocialPost] Invalid request body", {
        publicationDate,
        instagramAccountId,
        accessToken,
        pageId,
        userId,
        postId,
      });
      res.status(204).end();
    }

    await updateSocialPost(
      publicationDate,
      instagramAccountId,
      accessToken,
      pageId,
      userId,
      postId,
      req.log
    );

    req.log.info(`[api/updateSocialPost] Completed updateSocialPost endpoint`, {
      body: JSON.stringify(req.body),
    });
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/updateSocialPost] Error:", error.message);
    res.status(204).end();
  }
}
export const updateSocialPost = async (
  publicationDate: string,
  instagramAccountId: string,
  accessToken: string,
  pageId: string,
  userId: string,
  postId: string,
  log: Logger
) => {
  try {
    log.info(`[api/updateSocialPost] Starting updateSocialPost`, {
      parameters: {
        postId,
      },
    });
    log.info(
      `[api/updateSocialPost] Attempting to update post with id: ${postId}`
    );
    const { error } = await supabaseClient
      .from("InstagramPosts")
      .update({
        instagram_account_id: instagramAccountId,
        access_token: accessToken,
        time_to_post: publicationDate,
        notion_page_id: pageId,
        status: PostStatus.QUEUED,
        user_id: userId,
      })
      .eq("id", postId)
      .select();

    if (error) {
      return handleError(
        log,
        `[api/updateSocialPost] Error updating post in database`,
        error,
        {
          postId,
        }
      );
    }
    log.info(`[api/updateSocialPost] Completed updateSocialPost`, {
      parameters: {
        postId,
      },
    });
    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      `[api/updateSocialPost] Error updating post in database`,
      error,
      {
        postId,
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
