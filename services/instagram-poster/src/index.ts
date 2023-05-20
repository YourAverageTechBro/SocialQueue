import { Client } from "@notionhq/client";
import express, { Request, RequestHandler, Response } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const app = express();
const router: RequestHandler = async (req: Request, res: Response) => {
  try {
    if (req.method === "POST") {
      console.log("[instagram-poster] Starting POST endpoint");

      if (!req.body) {
        const msg = "no Pub/Sub message received";
        console.error(`[instagram-poster] Error on POST endpoint: ${msg}`);
        res.status(204).send(`Bad Request: ${msg}`);
        return;
      }
      if (!req.body.message) {
        const msg = "invalid Pub/Sub message format";
        console.error(`[instagram-poster] Error on POST endpoint: ${msg}`);
        res.status(204).send(`Bad Request: ${msg}`);
        return;
      }

      const pubSubMessage = req.body.message;
      const {
        uploadedPhotoUrls,
        uploadedVideoUrls,
        socialAccount,
        caption,
        instagramPost,
        notionAccessToken,
        userId,
      } = JSON.parse(Buffer.from(pubSubMessage.data, "base64").toString());

      if (
        !socialAccount ||
        !instagramPost ||
        !uploadedPhotoUrls ||
        !uploadedVideoUrls ||
        !notionAccessToken ||
        !userId
      )
        throw Error("Missing parameters");

      const { error } = await processPost(
        socialAccount,
        instagramPost,
        uploadedPhotoUrls,
        uploadedVideoUrls,
        caption,
        notionAccessToken,
        userId
      );
      if (error) throw error;
      console.log("[instagram-poster] Completed POST endpoint", {
        body: JSON.stringify(req.body),
      });
      res.status(204).send();
    }
  } catch (error: any) {
    console.error(`[instagram-poster] Error: ${error.message}`);
    res.status(204).send();
  }
};

const processPost = async (
  socialAccount: SocialAccounts,
  instagramPost: InstagramPost,
  uploadedPhotoUrls: string[],
  uploadedVideoUrls: string[],
  caption: string,
  notionAccessToken: string,
  userId: string
) => {
  console.log("[instagram-poster] Starting processPost", {
    parameters: {
      instagramPost: JSON.stringify(instagramPost),
      socialAccount: JSON.stringify(socialAccount),
      uploadedVideoUrls: JSON.stringify(uploadedVideoUrls),
      uploadedPhotoUrls: JSON.stringify(uploadedPhotoUrls),
      caption,
      notionAccessToken,
      userId,
    },
  });
  try {
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );

    const { error: updateInstagramPostToProcessingError } =
      await updateInstagramPostStatus(
        instagramPost.id,
        supabaseClient,
        PostStatus.PROCESSING
      );
    if (updateInstagramPostToProcessingError)
      throw updateInstagramPostToProcessingError;

    const { error: postToInstagramError } = await postToInstagram(
      socialAccount.social_id,
      uploadedPhotoUrls,
      uploadedVideoUrls,
      caption,
      socialAccount.access_token,
      supabaseClient,
      instagramPost.notion_page_id
    );
    if (postToInstagramError) throw postToInstagramError;

    const { error: updatePostError } = await updateNotionPageStatusToPosted(
      notionAccessToken,
      instagramPost
    );
    if (updatePostError) throw updatePostError;
    const { error: updateInstagramPostToPublishedError } =
      await updateInstagramPostStatus(
        instagramPost.id,
        supabaseClient,
        PostStatus.PUBLISHED
      );
    if (updateInstagramPostToPublishedError)
      throw updateInstagramPostToPublishedError;
    console.log("[instagram-poster] Completed processPost", {
      parameters: {
        instagramPost: JSON.stringify(instagramPost),
        socialAccount: JSON.stringify(socialAccount),
        uploadedVideoUrls: JSON.stringify(uploadedVideoUrls),
        uploadedPhotoUrls: JSON.stringify(uploadedPhotoUrls),
        caption,
        notionAccessToken,
        userId,
      },
    });
    return { error: null };
  } catch (error: any) {
    console.error("[instagram-poster] Error on processPost", {
      error: error.message,
      parameters: {
        instagramPost: JSON.stringify(instagramPost),
        socialAccount: JSON.stringify(socialAccount),
        uploadedVideoUrls: JSON.stringify(uploadedVideoUrls),
        uploadedPhotoUrls: JSON.stringify(uploadedPhotoUrls),
        caption,
        notionAccessToken,
        userId,
      },
    });
    return { error };
  }
};

const postToInstagram = async (
  userId: string,
  uploadedPhotoUrls: string[],
  uploadedVideoUrls: string[],
  caption: string,
  accessToken: string,
  supabaseClient: SupabaseClient,
  notionPageId: string
) => {
  try {
    console.log(`[instagram-poster] Starting postToInstagram`, {
      parameters: {
        userId,
        uploadedPhotoUrls,
        uploadedVideoUrls,
        caption,
        accessToken,
        notionPageId,
      },
    });
    if (uploadedPhotoUrls.length === 1 && uploadedVideoUrls.length === 0) {
      const { data: igContainerId, error: createInstagramPhotoContainerError } =
        await createInstagramPhotoContainer(
          uploadedPhotoUrls,
          userId,
          accessToken,
          caption
        );
      if (createInstagramPhotoContainerError)
        throw createInstagramPhotoContainerError;
      if (!igContainerId) throw Error("No id found on instagram container");
      const { error } = await checkInstagramContainerStatus(
        0,
        userId,
        igContainerId,
        accessToken,
        supabaseClient,
        notionPageId
      );
      if (error) throw error;
    } else if (
      uploadedPhotoUrls.length === 0 &&
      uploadedVideoUrls.length === 1
    ) {
      const { data: igContainerId, error: createInstagramPhotoContainerError } =
        await createInstagramReelContainer(
          uploadedVideoUrls,
          userId,
          accessToken,
          caption
        );
      if (createInstagramPhotoContainerError)
        throw createInstagramPhotoContainerError;
      if (!igContainerId) throw Error("No id found on instagram container");
      const { error } = await checkInstagramContainerStatus(
        0,
        userId,
        igContainerId,
        accessToken,
        supabaseClient,
        notionPageId
      );
      if (error) throw error;
    } else if (uploadedPhotoUrls.length + uploadedVideoUrls.length > 1) {
      if (uploadedPhotoUrls.length + uploadedVideoUrls.length > 10) {
        throw Error("Too much content for carousel. Max limit is 10");
      }
      const {
        data: igContainerId,
        error: createInstagramCarouselContainerError,
      } = await createInstagramCarouselContainer(
        uploadedPhotoUrls,
        uploadedVideoUrls,
        userId,
        accessToken,
        caption
      );
      if (createInstagramCarouselContainerError)
        throw createInstagramCarouselContainerError;
      if (!igContainerId) throw Error("No id found on instagram container");
      const { error } = await checkInstagramContainerStatus(
        0,
        userId,
        igContainerId,
        accessToken,
        supabaseClient,
        notionPageId
      );
      if (error) throw error;
    }

    console.log(`[instagram-poster] Completed postToInstagram`, {
      parameters: {
        userId,
        uploadedPhotoUrls,
        uploadedVideoUrls,
        caption,
        accessToken,
      },
    });
    return { error: null };
  } catch (error: any) {
    console.error(`[instagram-poster] Error on postToInstagram`, {
      error: error.message,
      parameters: {
        userId,
        uploadedPhotoUrls,
        uploadedVideoUrls,
        caption,
        accessToken,
      },
    });
    return { error };
  }
};

const createInstagramPhotoContainer = async (
  contentUrls: string[],
  userId: string,
  accessToken: string,
  caption: string
): Promise<{ data: string | null; error: any }> => {
  try {
    console.log("[instagram-poster] Starting createInstagramPhotoContainer", {
      parameters: { contentUrls, userId, accessToken, caption },
    });
    const imageUrl = contentUrls[0];
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?image_url=${imageUrl}&caption=${caption}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    console.log(
      `[instagram-poster][createInstagramPhotoContainer]: Received response from facebook media endpoint ${JSON.stringify(
        json
      )}`
    );
    if (json.error) throw Error(json.error.message);
    return { data: json.id, error: null };
  } catch (error: any) {
    console.error(
      `[instagram-poster][createInstagramPhotoContainer] Failed creating instagram photo container ${JSON.stringify(
        { contentUrls }
      )} with error: ${error.message}`
    );
    return { data: null, error };
  }
};

const createInstagramReelContainer = async (
  contentUrls: string[],
  userId: string,
  accessToken: string,
  caption: string
): Promise<{ data: string | undefined; error: any }> => {
  let responseData;
  let responseError;
  try {
    console.log(`[instagram-poster] Starting createInstagramReelContainer`, {
      parameters: {
        contentUrls,
        userId,
        accessToken,
        caption,
      },
    });
    const videoUrl = contentUrls[0];
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?media_type=${InstagramMediaType.REELS}&video_url=${videoUrl}&caption=${caption}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    console.log(
      `[instagram-poster] Received response from facebook media endpoint ${JSON.stringify(
        json
      )}`
    );
    if (json.error) throw Error(json.error.message);
    responseData = json.id;
    console.log(`[instagram-poster] Completed createInstagramReelContainer`, {
      data: JSON.stringify(responseData),
      parameters: {
        contentUrls,
        userId,
        accessToken,
        caption,
      },
    });
  } catch (error: any) {
    console.error(
      `[instagram-poster][createInstagramReelContainer] Failed creating instagram reel container ${JSON.stringify(
        { contentUrls }
      )} with error: ${error.message}`
    );
    responseError = error;
  } finally {
    return { data: responseData, error: responseError };
  }
};

const createInstagramCarouselContainer = async (
  uploadedPhotoUrls: string[],
  uploadedVideoUrls: string[],
  userId: string,
  accessToken: string,
  caption: string
): Promise<{ data: string | undefined; error: any }> => {
  let responseData;
  let responseError;
  try {
    console.log(
      `[instagram-poster] Starting createInstagramCarouselContainer`,
      {
        parameters: {
          uploadedPhotoUrls,
          uploadedVideoUrls,
          userId,
          accessToken,
          caption,
        },
      }
    );
    let igcontainerIds: string[] = [];

    // Upload all photos to IG
    await Promise.all(
      uploadedPhotoUrls.map(async (photoUrl) => {
        console.log(
          `[instagram-poster][createInstagramCarouselContainer]: Creating instagram carousel container for photo ${photoUrl}`
        );
        const resp = await fetch(
          `https://graph.facebook.com/v15.0/${userId}/media?image_url=${photoUrl}&is_carousel_item=true&access_token=${accessToken}`,
          {
            method: "POST",
          }
        );
        const json = (await resp.json()) as any;
        console.log(
          `[instagram-poster][createInstagramCarouselContainer]: Received response from facebook media endpoint for photoUrl ${photoUrl}: ${JSON.stringify(
            json
          )}`
        );
        if (json.error) throw Error(json.error.message);
        igcontainerIds.push(json.id);
      })
    );

    // Upload all videos to IG
    await Promise.all(
      uploadedVideoUrls.map(async (videoUrl) => {
        console.log(
          `[instagram-poster][createInstagramCarouselContainer]: Creating instagram carousel container for video ${videoUrl}`
        );
        const resp = await fetch(
          `https://graph.facebook.com/v15.0/${userId}/media?video_url=${videoUrl}&media_type=${InstagramMediaType.VIDEO}&is_carousel_item=true&access_token=${accessToken}`,
          {
            method: "POST",
          }
        );
        const json = (await resp.json()) as any;
        console.log(
          `[instagram-poster][createInstagramCarouselContainer]: Received response from facebook media endpoint for videoUrl ${videoUrl}: ${JSON.stringify(
            json
          )}`
        );
        if (json.error) throw Error(json.error.message);
        igcontainerIds.push(json.id);
      })
    );

    // Upload carousel container
    console.log(
      `[instagram-poster][createInstagramCarouselContainer]: Creating instagram carousel container with containerIds: ${JSON.stringify(
        igcontainerIds
      )}`
    );
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?caption=${caption}&media_type=${
        InstagramMediaType.CAROUSEL
      }&children=${igcontainerIds.join("%2C")}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    if (json.error) throw Error(json.error.message);
    responseData = json.id;
  } catch (error: any) {
    console.error(
      `[instagram-poster][createInstagramReelContainer] Failed creating instagram carousel container for photoUrls: ${JSON.stringify(
        { uploadedPhotoUrls }
      )} and videoUrls: ${JSON.stringify({ uploadedVideoUrls })} with error: ${
        error.message
      }`
    );
    responseError = error;
  } finally {
    return { data: responseData, error: responseError };
  }
};

const checkInstagramContainerStatus = async (
  retryCount: number,
  userId: string,
  containerId: string,
  accessToken: string,
  supabaseClient: SupabaseClient,
  notionPageId: string
) => {
  try {
    console.log("[instagram-poster] Starting checkInstagramContainerStatus", {
      parameters: {
        retryCount,
        userId,
        containerId,
        accessToken,
        notionPageId,
      },
    });
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${containerId}?access_token=${accessToken}&fields=status_code`,
      {
        method: "GET",
      }
    );
    const json = (await resp.json()) as any;
    if (retryCount > 10)
      throw Error("Instagram container could not finish processing in time");

    console.log(
      `[instagram-poster] Fetched current status from Facebook: ${JSON.stringify(
        json
      )}`
    );
    if (json.status_code === "ERROR") {
      await deletePostFromStorage(userId, notionPageId, supabaseClient);
      throw Error(json.error.message);
    } else if (json.status_code !== "FINISHED") {
      console.log(
        `[instagram-poster] Rechecking container status for containerId ${containerId}`
      );
      await _wait(10000);
      const { error } = await checkInstagramContainerStatus(
        retryCount + 1,
        userId,
        containerId,
        accessToken,
        supabaseClient,
        notionPageId
      );
      if (error) throw error;
    } else {
      const { error: instagramPublishError } = await publishInstagramContainer(
        userId,
        containerId,
        accessToken
      );
      const { error: deletePostFromStorageError } = await deletePostFromStorage(
        userId,
        notionPageId,
        supabaseClient
      );
      if (deletePostFromStorageError) throw deletePostFromStorageError;
      if (instagramPublishError) throw instagramPublishError;
    }
    return { error: null };
  } catch (error: any) {
    console.error(`[instagram-poster] Error on checkInstagramContainerStatus`, {
      error: error.message,
      parameters: {
        retryCount,
        userId,
        containerId,
        accessToken,
        notionPageId,
      },
    });
    return { error };
  }
};

const publishInstagramContainer = async (
  userId: string,
  igContainerId: string,
  accessToken: string
) => {
  let successfullyPostedContainer = false;
  let responseError;
  try {
    console.log(
      `[instagram-poster][publishInstagramContainer]: Starting to publish instagram container with parameters: ${JSON.stringify(
        {
          userId,
          igContainerId,
          accessToken,
        }
      )}`
    );
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media_publish?access_token=${accessToken}&creation_id=${igContainerId}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    if (json.error) throw Error(json.error.message);
    console.log(
      `[instagram-poster][publishInstagramContainer]: Successfully posted to Instagram with parameters ${JSON.stringify(
        {
          userId,
          igContainerId,
          accessToken,
        }
      )}`
    );
    successfullyPostedContainer = true;
  } catch (error: any) {
    console.error(
      `[instagram-poster][publishInstagramContainer]: Error: ${JSON.stringify(
        error
      )}`
    );
    responseError = error;
  } finally {
    return { data: successfullyPostedContainer, error: responseError };
  }
};

const deletePostFromStorage = async (
  userId: string,
  notionPageId: string,
  supabaseClient: SupabaseClient
) => {
  console.log(`[instagram-poster] Starting deletePostFromStorage`, {
    parameters: {
      userId,
      notionPageId,
    },
  });
  let successfullyDeleted = false;
  try {
    const { error } = await supabaseClient.storage
      .from(userId)
      .remove([notionPageId]);
    if (error) throw error;
    successfullyDeleted = true;
    console.log(`[instagram-poster] Completed deletePostFromStorage`, {
      parameters: {
        userId,
        notionPageId,
      },
    });
    return { error: null };
  } catch (error: any) {
    console.error(`[instagram-poster] Error on deletePostFromStorage`, {
      error: error.message,
      parameters: {
        userId,
        notionPageId,
      },
    });
    return { error };
  }
};

const updateNotionPageStatusToPosted = async (
  notionAccessToken: string,
  instagramPost: InstagramPost
) => {
  try {
    console.log("[instagram-poster] Starting updateNotionPageStatusToPosted", {
      parameters: {
        notionAccessToken,
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    const notion = new Client({
      auth: notionAccessToken,
    });

    const resp = await notion.pages.update({
      page_id: instagramPost.notion_page_id,
      properties: {
        Status: {
          select: { name: "Published" },
        },
      },
    });
    if (Object.keys(resp).length === 0) throw Error("No response from notion");
    console.log(`[instagram-poster] Completed updateNotionPageStatusToPosted`, {
      parameters: {
        notionAccessToken,
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    return { error: null };
  } catch (error: any) {
    console.error(
      `[instagram-poster] Error on updateNotionPageStatusToPosted`,
      {
        error: error.message,
        parameters: {
          notionAccessToken,
          instagramPost: JSON.stringify(instagramPost),
        },
      }
    );
    return { error };
  }
};

const updateInstagramPostStatus = async (
  instagramPostId: string,
  supabaseClient: SupabaseClient,
  status: PostStatus
) => {
  try {
    console.log("[instagram-poster] Starting updateInstagramPostStatus", {
      parameters: {
        instagramPostId,
        status,
      },
    });
    const { error } = await supabaseClient
      .from("InstagramPosts")
      .update({
        status,
      })
      .eq("id", instagramPostId);
    if (error) throw error;
    console.log("[instagram-poster] Completed updateInstagramPostStatus", {
      parameters: {
        instagramPostId,
        status,
      },
    });
    return { error: null };
  } catch (error: any) {
    console.error("[instagram-poster] Error on updateInstagramPostStatus", {
      error: error.message,
      parameters: {
        instagramPostId,
        status,
      },
    });
    return { error };
  }
};

function _wait(number: number) {
  return new Promise((resolve) => setTimeout(resolve, number));
}

app.use(express.json());
app.post("/", router);

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`[instagram-poster]: listening on port ${port}`);
});

export type User = {
  id: string;
  created_at: string;
  account_tier: string;
  notion_access_token: string;
  notion_bot_id: string;
  notion_duplicated_template_id: string;
  notion_owner: Record<string, any>;
  notion_workspace_icon: string;
  notion_workspace_id: string;
  notion_workspace_name: string;
  email: string;
  SocialAccounts: SocialAccounts[];
};

export type SocialAccounts = {
  id: number;
  social_id: string;
  created_at: string;
  social_platform: string;
  access_token: string;
  user_id: string;
  username: string;
};

export type InstagramPost = {
  id: string;
  created_at: string;
  post_url: string;
  status: PostStatus;
  post_id: string;
  notion_page_id: string;
  time_to_post: string;
  caption: string;
  access_token: string;
  media_urls: string;
  instagram_account_id: string;
  media_type: InstagramMediaType;
};

export enum PostStatus {
  QUEUED = "QUEUED",
  PUBLISHED = "PUBLISHED",
  PROCESSING = "PROCESSING",
  FAILED = "FAILED",
}

// If posting a normal image, no media type necessary
export enum InstagramMediaType {
  REELS = "REELS",
  CAROUSEL = "CAROUSEL",
  VIDEO = "VIDEO",
}
