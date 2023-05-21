import { verifySignature } from "@upstash/qstash/nextjs";
import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { NextApiResponse } from "next";
import fetch from "node-fetch";
import { InstagramMediaType } from "../../types/supabaseTypes";
import { handleError, supabaseClient } from "../../utils/utils";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(
      `[api/createInstagramCarouselContainer] Starting createInstagramCarouselContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    const { videoUrls, imageUrls, userId, accessToken, caption, postId } =
      req.body;

    if ((!imageUrls && !videoUrls) || !userId || !accessToken || !postId) {
      req.log.error(
        "[api/createInstagramCarouselContainer] Invalid request body",
        {
          videoUrls,
          imageUrls,
          userId,
          accessToken,
          caption,
          postId,
        }
      );
      res.status(204).end();
      return;
    }

    const resp = await createInstagramCarouselContainer(
      imageUrls,
      videoUrls,
      userId,
      accessToken,
      req.log,
      postId,
      caption
    );

    if (resp?.error) {
      req.log.error(
        "[api/createInstagramCarouselContainer] Error:",
        resp.error.message
      );
      res.status(204).end();
      return;
    }

    req.log.info(
      `[api/createInstagramCarouselContainer] Completed createInstagramCarouselContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    res.status(204).end();
  } catch (error: any) {
    req.log.error(
      "[api/createInstagramCarouselContainer] Error:",
      error.message
    );
    res.status(204).end();
  }
}

const createInstagramCarouselContainer = async (
  photoUrls: string[],
  videoUrls: string[],
  userId: string,
  accessToken: string,
  log: Logger,
  postId: string,
  caption?: string
) => {
  try {
    log.info(
      `[api/instagramPoster][createInstagramCarouselContainer] Starting function`,
      {
        parameters: {
          photoUrls,
          videoUrls,
          userId,
          accessToken,
          caption,
        },
      }
    );
    let igContainerIds: string[] = [];

    // Upload all photos to IG
    await Promise.all(
      photoUrls.map(async (photoUrl) => {
        log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Creating instagram carousel container for photo ${photoUrl}`
        );
        const resp = await fetch(
          `https://graph.facebook.com/v15.0/${userId}/media?image_url=${photoUrl}&is_carousel_item=true&access_token=${accessToken}`,
          {
            method: "POST",
          }
        );
        const json = (await resp.json()) as any;
        log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Received response from facebook media endpoint for photoUrl ${photoUrl}: ${JSON.stringify(
            json
          )}`
        );
        if (json.error) throw Error(json.error.message);
        igContainerIds.push(json.id);
      })
    );

    // Upload all videos to IG
    await Promise.all(
      videoUrls.map(async (videoUrl) => {
        log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Creating instagram carousel container for video ${videoUrl}`
        );
        const resp = await fetch(
          `https://graph.facebook.com/v15.0/${userId}/media?video_url=${videoUrl}&media_type=${InstagramMediaType.VIDEO}&is_carousel_item=true&access_token=${accessToken}`,
          {
            method: "POST",
          }
        );
        const json = (await resp.json()) as any;
        log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Received response from facebook media endpoint for videoUrl ${videoUrl}: ${JSON.stringify(
            json
          )}`
        );
        if (json.error) throw Error(json.error.message);
        igContainerIds.push(json.id);
      })
    );

    // Upload carousel container
    log.info(
      `[api/instagramPoster][createInstagramCarouselContainer]: Creating instagram carousel container with containerIds: ${JSON.stringify(
        igContainerIds
      )}`
    );
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?caption=${caption}&media_type=${
        InstagramMediaType.CAROUSEL
      }&children=${igContainerIds.join("%2C")}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    if (json.error) {
      return handleError(
        log,
        "[api/instagramPoster][createInstagramCarouselContainer] Error on function",
        Error(json.error.message),
        {
          photoUrls,
          videoUrls,
          userId,
          accessToken,
          caption,
        }
      );
    }

    const { error } = await supabaseClient
      .from("InstagramPosts")
      .update({
        instagram_container_id: json.id,
      })
      .eq("id", postId);

    if (error) {
      return handleError(
        log,
        "[api/instagramPoster][createInstagramCarouselContainer] Error on function",
        error,
        {
          photoUrls,
          videoUrls,
          userId,
          accessToken,
          caption,
        }
      );
    }
  } catch (error: any) {
    return handleError(
      log,
      "[api/instagramPoster][createInstagramCarouselContainer] Error on function",
      error,
      {
        photoUrls,
        videoUrls,
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
