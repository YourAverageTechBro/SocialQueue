import { verifySignature } from "@upstash/qstash/nextjs";
import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { NextApiResponse } from "next";
import { handleError, supabaseClient } from "../../utils/utils";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(`[api/deleteSocialPost] Starting deleteSocialPost endpoint`, {
      body: JSON.stringify(req.body),
    });
    const { postId } = req.body;

    if (!postId) {
      req.log.error("[api/deleteSocialPost] Invalid request body", {
        postId,
      });
      res.status(204).end();
    }

    await deleteSocialPost(postId, req.log);

    req.log.info(`[api/deleteSocialPost] Completed deleteSocialPost endpoint`, {
      body: JSON.stringify(req.body),
    });
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/deleteSocialPost] Error:", error.message);
    res.status(204).end();
  }
}
export const deleteSocialPost = async (postId: string, log: Logger) => {
  try {
    log.info(`[api/deleteSocialPost] Starting deleteSocialPost`, {
      parameters: {
        postId,
      },
    });
    log.info(
      `[api/deleteSocialPost] Attempting to delete post from database with id: ${postId}`
    );
    const { error } = await supabaseClient
      .from("InstagramPosts")
      .delete()
      .eq("id", postId);
    if (error) {
      return handleError(
        log,
        `[api/deleteSocialPost] Error deleting post from database`,
        error,
        {
          postId,
        }
      );
    }
    log.info(`[api/deleteSocialPost] Completed deleteSocialPost`, {
      parameters: {
        postId,
      },
    });
    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      `[api/deleteSocialPost] Error deleting post from database`,
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
