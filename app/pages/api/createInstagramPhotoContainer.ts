import { verifySignature } from "@upstash/qstash/nextjs";
import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { NextApiResponse } from "next";
import fetch from "node-fetch";
import { handleError, supabaseClient } from "../../utils/utils";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(
      `[api/createInstagramPhotoContainer] Starting createInstagramPhotoContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    const { imageUrl, userId, accessToken, caption, postId } = req.body;

    if (!imageUrl || !userId || !accessToken || !postId) {
      req.log.error(
        "[api/createInstagramPhotoContainer] Invalid request body",
        {
          imageUrl,
          userId,
          accessToken,
          caption,
          postId,
        }
      );
      res.status(204).end();
      return;
    }

    const resp = await createInstagramPhotoContainer(
      imageUrl,
      userId,
      accessToken,
      postId,
      req.log,
      caption
    );

    if (resp.error) {
      req.log.error(
        "[api/createInstagramPhotoContainer] Error:",
        resp.error.message
      );
      res.status(204).end();
      return;
    }

    req.log.info(
      `[api/createInstagramPhotoContainer] Completed createInstagramPhotoContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/createInstagramPhotoContainer] Error:", error.message);
    res.status(204).end();
  }
}

const createInstagramPhotoContainer = async (
  imageUrl: string,
  userId: string,
  accessToken: string,
  postId: string,
  log: Logger,
  caption?: string
): Promise<{ error: any }> => {
  try {
    log.info(
      "[api/createInstagramPhotoContainer][createInstagramPhotoContainer] Starting function",
      {
        parameters: { imageUrl, userId, accessToken, caption },
      }
    );
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?image_url=${imageUrl}&caption=${caption}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    log.info(
      `[api/createInstagramPhotoContainer][createInstagramPhotoContainer]: Received response from facebook media endpoint ${JSON.stringify(
        json
      )}`
    );
    if (json.error) {
      return handleError(
        log,
        "[api/createInstagramPhotoContainer][createInstagramPhotoContainer] Error on function",
        Error(json.error.message),
        {
          imageUrl,
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
      "[api/createInstagramPhotoContainer][createInstagramPhotoContainer] Completed function",
      {
        parameters: { imageUrl, userId, accessToken, caption },
      }
    );

    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      "[api/createInstagramPhotoContainer][createInstagramPhotoContainer] Error on function",
      error,
      {
        imageUrl,
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
