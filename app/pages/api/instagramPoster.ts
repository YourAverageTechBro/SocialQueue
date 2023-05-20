import fetch from "node-fetch";
import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { verifySignature } from "@upstash/qstash/nextjs";
import { updateInstagramPostStatus } from "../../utils/utils";
import {
  InstagramMediaType,
  InstagramPost,
  PostStatus,
  SocialAccounts,
} from "../../types/supabaseTypes";
import { Client } from "@notionhq/client"; // TODO: clean up this file with better logging too

// TODO: clean up this file with better logging too
async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    if (req.method === "POST") {
      req.log.info("[api/instagramPoster] Starting POST endpoint");

      const {
        uploadedPhotoUrls,
        uploadedVideoUrls,
        socialAccount,
        caption,
        instagramPost,
        notionAccessToken,
        userId,
      } = req.body;

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
        userId,
        req
      );
      if (error) throw error;
      req.log.info("[api/instagramPoster] Completed POST endpoint", {
        body: JSON.stringify(req.body),
      });
      res.status(204).end();
    }
  } catch (error: any) {
    req.log.error(`[api/instagramPoster] Error: ${error.message}`);
    res.status(204).end();
  }
}

const processPost = async (
  socialAccount: SocialAccounts,
  instagramPost: InstagramPost,
  uploadedPhotoUrls: string[],
  uploadedVideoUrls: string[],
  caption: string,
  notionAccessToken: string,
  userId: string,
  req: AxiomAPIRequest
) => {
  req.log.info("[api/instagramPoster] Starting processPost", {
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

    const { error: postToInstagramError } = await postToInstagram(
      socialAccount.social_id,
      uploadedPhotoUrls,
      uploadedVideoUrls,
      caption,
      socialAccount.access_token,
      supabaseClient,
      instagramPost.notion_page_id,
      req
    );
    if (postToInstagramError) throw postToInstagramError;

    const { error: updatePostError } = await updateNotionPageStatusToPosted(
      notionAccessToken,
      instagramPost,
      req
    );
    if (updatePostError) throw updatePostError;
    const { error: updateInstagramPostToPublishedError } =
      await updateInstagramPostStatus(
        instagramPost.id,
        supabaseClient,
        PostStatus.PUBLISHED,
        "api/instagramPoster",
        req
      );
    if (updateInstagramPostToPublishedError)
      throw updateInstagramPostToPublishedError;
    req.log.info("[api/instagramPoster] Completed processPost", {
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
    req.log.error("[api/instagramPoster] Error on processPost", {
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
  notionPageId: string,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[api/instagramPoster] Starting postToInstagram`, {
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
          caption,
          req
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
        notionPageId,
        req
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
          caption,
          req
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
        notionPageId,
        req
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
        caption,
        req
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
        notionPageId,
        req
      );
      if (error) throw error;
    }

    req.log.info(`[api/instagramPoster] Completed postToInstagram`, {
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
    req.log.error(`[api/instagramPoster] Error on postToInstagram`, {
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
  caption: string,
  req: AxiomAPIRequest
): Promise<{ data: string | null; error: any }> => {
  try {
    req.log.info(
      "[api/instagramPoster] Starting createInstagramPhotoContainer",
      {
        parameters: { contentUrls, userId, accessToken, caption },
      }
    );
    const imageUrl = contentUrls[0];
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?image_url=${imageUrl}&caption=${caption}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    req.log.info(
      `[api/instagramPoster][createInstagramPhotoContainer]: Received response from facebook media endpoint ${JSON.stringify(
        json
      )}`
    );
    if (json.error) throw Error(json.error.message);
    return { data: json.id, error: null };
  } catch (error: any) {
    req.log.error(
      `[api/instagramPoster][createInstagramPhotoContainer] Failed creating instagram photo container ${JSON.stringify(
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
  caption: string,
  req: AxiomAPIRequest
): Promise<{ data: string | undefined; error: any }> => {
  let responseData;
  let responseError;
  try {
    req.log.info(
      `[api/instagramPoster] Starting createInstagramReelContainer`,
      {
        parameters: {
          contentUrls,
          userId,
          accessToken,
          caption,
        },
      }
    );
    const videoUrl = contentUrls[0];
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${userId}/media?media_type=${InstagramMediaType.REELS}&video_url=${videoUrl}&caption=${caption}&access_token=${accessToken}`,
      {
        method: "POST",
      }
    );
    const json = (await resp.json()) as any;
    req.log.info(
      `[api/instagramPoster] Received response from facebook media endpoint ${JSON.stringify(
        json
      )}`
    );
    if (json.error) throw Error(json.error.message);
    responseData = json.id;
    req.log.info(
      `[api/instagramPoster] Completed createInstagramReelContainer`,
      {
        data: JSON.stringify(responseData),
        parameters: {
          contentUrls,
          userId,
          accessToken,
          caption,
        },
      }
    );
  } catch (error: any) {
    req.log.error(
      `[api/instagramPoster][createInstagramReelContainer] Failed creating instagram reel container ${JSON.stringify(
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
  caption: string,
  req: AxiomAPIRequest
): Promise<{ data: string | undefined; error: any }> => {
  let responseData;
  let responseError;
  try {
    req.log.info(
      `[api/instagramPoster] Starting createInstagramCarouselContainer`,
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
        req.log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Creating instagram carousel container for photo ${photoUrl}`
        );
        const resp = await fetch(
          `https://graph.facebook.com/v15.0/${userId}/media?image_url=${photoUrl}&is_carousel_item=true&access_token=${accessToken}`,
          {
            method: "POST",
          }
        );
        const json = (await resp.json()) as any;
        req.log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Received response from facebook media endpoint for photoUrl ${photoUrl}: ${JSON.stringify(
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
        req.log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Creating instagram carousel container for video ${videoUrl}`
        );
        const resp = await fetch(
          `https://graph.facebook.com/v15.0/${userId}/media?video_url=${videoUrl}&media_type=${InstagramMediaType.VIDEO}&is_carousel_item=true&access_token=${accessToken}`,
          {
            method: "POST",
          }
        );
        const json = (await resp.json()) as any;
        req.log.info(
          `[api/instagramPoster][createInstagramCarouselContainer]: Received response from facebook media endpoint for videoUrl ${videoUrl}: ${JSON.stringify(
            json
          )}`
        );
        if (json.error) throw Error(json.error.message);
        igcontainerIds.push(json.id);
      })
    );

    // Upload carousel container
    req.log.info(
      `[api/instagramPoster][createInstagramCarouselContainer]: Creating instagram carousel container with containerIds: ${JSON.stringify(
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
    req.log.error(
      `[api/instagramPoster][createInstagramReelContainer] Failed creating instagram carousel container for photoUrls: ${JSON.stringify(
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
  notionPageId: string,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(
      "[api/instagramPoster] Starting checkInstagramContainerStatus",
      {
        parameters: {
          retryCount,
          userId,
          containerId,
          accessToken,
          notionPageId,
        },
      }
    );
    const resp = await fetch(
      `https://graph.facebook.com/v15.0/${containerId}?access_token=${accessToken}&fields=status_code`,
      {
        method: "GET",
      }
    );
    const json = (await resp.json()) as any;
    if (retryCount > 10)
      throw Error("Instagram container could not finish processing in time");

    req.log.info(
      `[api/instagramPoster] Fetched current status from Facebook: ${JSON.stringify(
        json
      )}`
    );
    if (json.status_code === "ERROR") {
      await deletePostFromStorage(userId, notionPageId, supabaseClient, req);
      throw Error(json.error.message);
    } else if (json.status_code !== "FINISHED") {
      req.log.info(
        `[api/instagramPoster] Rechecking container status for containerId ${containerId}`
      );
      await _wait(10000);
      const { error } = await checkInstagramContainerStatus(
        retryCount + 1,
        userId,
        containerId,
        accessToken,
        supabaseClient,
        notionPageId,
        req
      );
      if (error) throw error;
    } else {
      const { error: instagramPublishError } = await publishInstagramContainer(
        userId,
        containerId,
        accessToken,
        req
      );
      const { error: deletePostFromStorageError } = await deletePostFromStorage(
        userId,
        notionPageId,
        supabaseClient,
        req
      );
      if (deletePostFromStorageError) throw deletePostFromStorageError;
      if (instagramPublishError) throw instagramPublishError;
    }
    return { error: null };
  } catch (error: any) {
    req.log.error(
      `[api/instagramPoster] Error on checkInstagramContainerStatus`,
      {
        error: error.message,
        parameters: {
          retryCount,
          userId,
          containerId,
          accessToken,
          notionPageId,
        },
      }
    );
    return { error };
  }
};

const publishInstagramContainer = async (
  userId: string,
  igContainerId: string,
  accessToken: string,
  req: AxiomAPIRequest
) => {
  let successfullyPostedContainer = false;
  let responseError;
  try {
    req.log.info(
      `[api/instagramPoster][publishInstagramContainer]: Starting to publish instagram container with parameters: ${JSON.stringify(
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
    req.log.info(
      `[api/instagramPoster][publishInstagramContainer]: Successfully posted to Instagram with parameters ${JSON.stringify(
        {
          userId,
          igContainerId,
          accessToken,
        }
      )}`
    );
    successfullyPostedContainer = true;
  } catch (error: any) {
    req.log.error(
      `[api/instagramPoster][publishInstagramContainer]: Error: ${JSON.stringify(
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
  supabaseClient: SupabaseClient,
  req: AxiomAPIRequest
) => {
  req.log.info(`[api/instagramPoster] Starting deletePostFromStorage`, {
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
    req.log.info(`[api/instagramPoster] Completed deletePostFromStorage`, {
      parameters: {
        userId,
        notionPageId,
      },
    });
    return { error: null };
  } catch (error: any) {
    req.log.error(`[api/instagramPoster] Error on deletePostFromStorage`, {
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
  instagramPost: InstagramPost,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(
      "[api/instagramPoster] Starting updateNotionPageStatusToPosted",
      {
        parameters: {
          notionAccessToken,
          instagramPost: JSON.stringify(instagramPost),
        },
      }
    );
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
    req.log.info(
      `[api/instagramPoster] Completed updateNotionPageStatusToPosted`,
      {
        parameters: {
          notionAccessToken,
          instagramPost: JSON.stringify(instagramPost),
        },
      }
    );
    return { error: null };
  } catch (error: any) {
    req.log.error(
      `[api/instagramPoster] Error on updateNotionPageStatusToPosted`,
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

function _wait(number: number) {
  return new Promise((resolve) => setTimeout(resolve, number));
}

// @ts-ignore
export default withAxiom(verifySignature(handler));

export const config = {
  api: {
    bodyParser: false,
  },
};
