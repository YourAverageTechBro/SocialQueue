import { verifySignature } from "@upstash/qstash/nextjs";
import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { NextApiResponse } from "next";
import fetch from "node-fetch";
import { InstagramMediaType } from "../../types/supabaseTypes";
import { handleError, supabaseClient } from "../../utils/utils";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(
      `[api/createInstagramReelContainer] Starting createInstagramReelContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    const { videoUrl, userId, accessToken, caption, postId } = req.body;

    if (!videoUrl || !userId || !accessToken || !postId) {
      req.log.error("[api/createInstagramReelContainer] Invalid request body", {
        videoUrl,
        userId,
        accessToken,
        caption,
        postId,
      });
      res.status(204).end();
      return;
    }

    const resp = await createInstagramReelContainer(
      videoUrl,
      userId,
      accessToken,
      postId,
      req.log,
      caption
    );

    if (resp.error) {
      req.log.error(
        "[api/createInstagramReelContainer] Error:",
        resp.error.message
      );
      res.status(204).end();
      return;
    }

    req.log.info(
      `[api/createInstagramReelContainer] Completed createInstagramReelContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/createInstagramReelContainer] Error:", error.message);
    res.status(204).end();
  }
}

const createInstagramReelContainer = async (
  videoUrl: string,
  userId: string,
  accessToken: string,
  postId: string,
  log: Logger,
  caption?: string
) => {
  try {
    log.info(
      `[api/instagramPoster][createInstagramReelContainer] Starting function`,
      {
        parameters: {
          videoUrl,
          userId,
          accessToken,
          caption,
        },
      }
    );
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?media_type=${InstagramMediaType.REELS}&video_url=${videoUrl}&caption=${caption}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    log.info(
      `[api/instagramPoster][createInstagramReelContainer] Received response from facebook media endpoint ${JSON.stringify(
        json
      )}`
    );
    if (json.error) {
      return handleError(
        log,
        "[api/instagramPoster][createInstagramReelContainer] Error on createInstagramReelContainer",
        Error(json.error.message),
        {
          videoUrl,
          userId,
          accessToken,
          caption,
        }
      );
    }

    await supabaseClient
      .from("InstagramPosts")
      .update({
        instagram_container_id: json.id,
      })
      .eq("id", postId);

    log.info(
      `[api/instagramPoster][createInstagramReelContainer] Completed function`,
      {
        parameters: {
          videoUrl,
          userId,
          accessToken,
          caption,
        },
      }
    );

    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      "[api/instagramPoster][createInstagramReelContainer] Error on function",
      error,
      {
        videoUrl,
        userId,
        accessToken,
        caption,
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
