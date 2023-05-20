import express, { Request, RequestHandler, Response } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { PubSub } from "@google-cloud/pubsub";

const app = express();
const router: RequestHandler = async (req: Request, res: Response) => {
  try {
    if (req.method === "POST") {
      console.log("[media-upload] Starting POST endpoint");

      if (!req.body) {
        const msg = "no Pub/Sub message received";
        console.error(`[api/media-upload] Error on POST endpoint: ${msg}`);
        res.status(204).send(`Bad Request: ${msg}`);
        return;
      }
      if (!req.body.message) {
        const msg = "invalid Pub/Sub message format";
        console.error(`[api/media-upload] Error on POST endpoint: ${msg}`);
        res.status(204).send(`Bad Request: ${msg}`);
        return;
      }

      const pubSubMessage = req.body.message;
      const {
        userId,
        caption,
        photoUrls,
        videoUrls,
        socialAccount,
        notionAccessToken,
        instagramPost,
      } = JSON.parse(Buffer.from(pubSubMessage.data, "base64").toString());

      if (
        !userId ||
        !socialAccount ||
        !notionAccessToken ||
        (!photoUrls && !videoUrls) ||
        !instagramPost
      )
        throw Error("Missing parameters");
      const { data: uploadedMedia, error: uploadMediaError } =
        await uploadImagesAndVideosToSupabase(
          photoUrls,
          videoUrls,
          userId,
          instagramPost.notion_page_id
        );
      if (uploadMediaError) throw uploadMediaError;
      if (!uploadedMedia) throw Error("Uploaded media not found");
      const { uploadedPhotoUrls, uploadedVideoUrls } = uploadedMedia;

      const pubSubClient = new PubSub();
      const topicName = "projects/socialqueue-374118/topics/media-upload";
      const dataBuffer = Buffer.from(
        JSON.stringify({
          uploadedPhotoUrls,
          uploadedVideoUrls,
          socialAccount,
          caption,
          instagramPost,
          notionAccessToken,
          userId,
        })
      );

      await pubSubClient.topic(topicName).publishMessage({ data: dataBuffer });
      if (uploadMediaError) throw uploadMediaError;
      console.log("[media-upload] Completed POST endpoint", {
        body: JSON.stringify(req.body),
      });

      res.status(204).send();
    }
  } catch (error: any) {
    console.error(`[media-upload] Error: ${error.message}`);
    res.status(204).send();
  }
};

const uploadImagesAndVideosToSupabase = async (
  photoUrls: string[],
  videoUrls: string[],
  userId: string,
  notionPageId: string
) => {
  let uploadedPhotoUrls: string[] = [];
  let uploadedVideoUrls: string[] = [];

  try {
    console.log(`[media-upload] Starting uploadImagesAndVideosToSupabase`, {
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
        console.log(
          `[media-upload] Uploading image ${photoUrl} for user ${userId} and notion page id ${notionPageId}`
        );
        const { data, error } = await uploadMediaToSupabase(
          photoUrl,
          userId,
          supabaseClient,
          notionPageId
        );
        if (error) throw error;
        if (!data) throw Error("No data returned");
        uploadedPhotoUrls.push(data);
      })
    );

    await Promise.all(
      videoUrls.map(async (videoUrl) => {
        console.log(
          `[media-upload] Uploading video ${videoUrl} for user ${userId} and notion page id ${notionPageId}`
        );
        const { data, error } = await uploadMediaToSupabase(
          videoUrl,
          userId,
          supabaseClient,
          notionPageId
        );
        if (error) throw error;
        if (!data) throw Error("No data returned");
        uploadedVideoUrls.push(data);
      })
    );

    console.log(`[media-upload] Completed uploadImagesAndVideosToSupabase`, {
      parameters: {
        photoUrls: JSON.stringify(photoUrls),
        videoUrls: JSON.stringify(videoUrls),
        uploadedVideoUrls: JSON.stringify(uploadedVideoUrls),
        uploadedPhotoUrls: JSON.stringify(uploadedPhotoUrls),
        userId,
        notionPageId,
      },
    });

    return {
      data: {
        uploadedPhotoUrls,
        uploadedVideoUrls,
      },
      error: null,
    };
  } catch (error: any) {
    console.error(`[media-upload] Error on uploadImagesAndVideosToSupabase`, {
      error: error.message,
      parameters: {
        photoUrls: JSON.stringify(photoUrls),
        videoUrls: JSON.stringify(videoUrls),
        userId,
        notionPageId,
      },
    });
    return { data: null, error };
  }
};

const uploadMediaToSupabase = async (
  mediaUrl: string,
  userId: string,
  supabaseClient: SupabaseClient,
  notionPageId: string
) => {
  let publicUrl;
  let responseError;
  try {
    console.log(`[media-upload] Starting uploadMediaToSupabase`, {
      parameters: {
        mediaUrl,
        userId,
        notionPageId,
      },
    });
    console.log(
      `[media-upload] Attempting to download media from s3: ${mediaUrl}`
    );
    let blob = await fetch(mediaUrl).then((r) => r.blob());
    console.log(
      `[media-upload] Successfully downloaded media from s3: ${mediaUrl}`
    );

    console.log("[media-upload] Attempting to upload media to supabase");
    const { data: uploadData, error: uploadError } =
      await supabaseClient.storage.from(userId).upload(notionPageId, blob, {
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) throw uploadError;
    console.log(
      "[media-upload] Successfully uploaded media to supabase: ",
      uploadData
    );
    const { data: signedUrl, error: signedUrlError } =
      await supabaseClient.storage
        .from(userId)
        .createSignedUrl(notionPageId, 300);
    if (signedUrlError) throw signedUrlError;
    if (!signedUrl.signedUrl) throw Error("No signed url returned");
    publicUrl = signedUrl.signedUrl;
    console.log(`[media-upload] Completed uploadMediaToSupabase`, {
      publicUrl,
      parameters: {
        mediaUrl,
        userId,
        notionPageId,
      },
    });
  } catch (error: any) {
    console.error(`[media-upload] Error on uploadMediaToSupabase`, {
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

app.use(express.json());
app.post("/", router);

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`[instagram-poster]: listening on port ${port}`);
});
