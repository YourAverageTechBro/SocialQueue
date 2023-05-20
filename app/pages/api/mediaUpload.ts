import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import { Client } from "@upstash/qstash";
import { verifySignature } from "@upstash/qstash/nextjs";

// TODO: clean up this file with better logging too
async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    if (req.method === "POST") {
      req.log.info("[api/mediaUpload] Starting POST endpoint");
      const {
        userId,
        caption,
        photoUrls,
        videoUrls,
        socialAccount,
        notionAccessToken,
        instagramPost,
      } = req.body;

      if (
        !userId ||
        !socialAccount ||
        !notionAccessToken ||
        (!photoUrls && !videoUrls) ||
        !instagramPost
      ) {
        throw Error("Missing parameters");
      }
      const { data: uploadedMedia, error: uploadMediaError } =
        await uploadImagesAndVideosToSupabase(
          photoUrls,
          videoUrls,
          userId,
          instagramPost.notion_page_id,
          req
        );
      if (uploadMediaError) throw uploadMediaError;
      if (!uploadedMedia) throw Error("Uploaded media not found");
      const { uploadedPhotoUrls, uploadedVideoUrls } = uploadedMedia;

      const c = new Client({
        token: process.env.QSTASH_TOKEN ?? "",
      });

      const qStashRes = await c.publishJSON({
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/instagramPoster`,
        // or topic: "the name or id of a topic"
        body: {
          uploadedPhotoUrls,
          uploadedVideoUrls,
          socialAccount,
          caption,
          instagramPost,
          notionAccessToken,
          userId,
        },
        retries: 0,
      });
      req.log.info(`[api/mediaUpload] Post ${qStashRes.messageId} published`);
      req.log.info("[api/mediaUpload] Completed POST endpoint", {
        body: JSON.stringify(req.body),
      });
      res.status(204).end();
    }
  } catch (error: any) {
    req.log.error(`[api/mediaUpload] Error: ${error.message}`);
    res.status(204).end();
  }
}

const uploadImagesAndVideosToSupabase = async (
  photoUrls: string[],
  videoUrls: string[],
  userId: string,
  notionPageId: string,
  req: AxiomAPIRequest
) => {
  let uploadedPhotoUrls: string[] = [];
  let uploadedVideoUrls: string[] = [];

  try {
    req.log.info(`[api/mediaUpload] Starting uploadImagesAndVideosToSupabase`, {
      parameters: {
        photoUrls: JSON.stringify(photoUrls),
        videoUrls: JSON.stringify(videoUrls),
        userId,
        notionPageId,
      },
    });

    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );

    await Promise.all(
      photoUrls.map(async (photoUrl) => {
        req.log.info(
          `[api/mediaUpload] Uploading image ${photoUrl} for user ${userId} and notion page id ${notionPageId}`
        );
        const { data, error } = await uploadMediaToSupabase(
          photoUrl,
          userId,
          supabaseClient,
          notionPageId,
          req
        );
        if (error) throw error;
        if (!data) throw Error("No data returned");
        uploadedPhotoUrls.push(data);
      })
    );

    await Promise.all(
      videoUrls.map(async (videoUrl) => {
        req.log.info(
          `[api/mediaUpload] Uploading video ${videoUrl} for user ${userId} and notion page id ${notionPageId}`
        );
        const { data, error } = await uploadMediaToSupabase(
          videoUrl,
          userId,
          supabaseClient,
          notionPageId,
          req
        );
        if (error) throw error;
        if (!data) throw Error("No data returned");
        uploadedVideoUrls.push(data);
      })
    );

    req.log.info(
      `[api/mediaUpload] Completed uploadImagesAndVideosToSupabase`,
      {
        parameters: {
          photoUrls: JSON.stringify(photoUrls),
          videoUrls: JSON.stringify(videoUrls),
          uploadedVideoUrls: JSON.stringify(uploadedVideoUrls),
          uploadedPhotoUrls: JSON.stringify(uploadedPhotoUrls),
          userId,
          notionPageId,
        },
      }
    );

    return {
      data: {
        uploadedPhotoUrls,
        uploadedVideoUrls,
      },
      error: null,
    };
  } catch (error: any) {
    req.log.error(
      `[api/mediaUpload] Error on uploadImagesAndVideosToSupabase`,
      {
        error: error.message,
        parameters: {
          photoUrls: JSON.stringify(photoUrls),
          videoUrls: JSON.stringify(videoUrls),
          userId,
          notionPageId,
        },
      }
    );
    return { data: null, error };
  }
};

const uploadMediaToSupabase = async (
  mediaUrl: string,
  userId: string,
  supabaseClient: SupabaseClient,
  notionPageId: string,
  req: AxiomAPIRequest
) => {
  let publicUrl;
  let responseError;
  try {
    req.log.info(`[api/mediaUpload] Starting uploadMediaToSupabase`, {
      parameters: {
        mediaUrl,
        userId,
        notionPageId,
      },
    });
    req.log.info(
      `[api/mediaUpload] Attempting to download media from s3: ${mediaUrl}`
    );
    let blob = await fetch(mediaUrl).then((r) => r.blob());
    req.log.info(
      `[api/mediaUpload] Successfully downloaded media from s3: ${mediaUrl}`
    );

    req.log.info("[api/mediaUpload] Attempting to upload media to supabase");
    const { data: uploadData, error: uploadError } =
      await supabaseClient.storage.from(userId).upload(notionPageId, blob, {
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) throw uploadError;
    req.log.info(
      "[api/mediaUpload] Successfully uploaded media to supabase: ",
      uploadData
    );
    const { data: signedUrl, error: signedUrlError } =
      await supabaseClient.storage
        .from(userId)
        .createSignedUrl(notionPageId, 300);
    if (signedUrlError) throw signedUrlError;
    if (!signedUrl.signedUrl) throw Error("No signed url returned");
    publicUrl = signedUrl.signedUrl;
    req.log.info(`[api/mediaUpload] Completed uploadMediaToSupabase`, {
      publicUrl,
      parameters: {
        mediaUrl,
        userId,
        notionPageId,
      },
    });
  } catch (error: any) {
    req.log.error(`[api/mediaUpload] Error on uploadMediaToSupabase`, {
      error: error.message,
      parameters: {
        mediaUrl,
        userId,
        notionPageId,
      },
    });
    responseError = error;
  } finally {
    return { data: publicUrl, error: responseError };
  }
};

// @ts-ignore
export default withAxiom(verifySignature(handler));

export const config = {
  api: {
    bodyParser: false,
  },
};
