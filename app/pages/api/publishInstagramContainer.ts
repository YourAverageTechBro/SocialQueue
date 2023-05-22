import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { verifySignature } from "@upstash/qstash/nextjs";
import { NextApiResponse } from "next";
import fetch from "node-fetch";
import { Client } from "@notionhq/client";
import { handleError, rateLimit, supabaseClient } from "../../utils/utils";
import { PostStatus } from "../../types/supabaseTypes";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(
      `[api/publishInstagramContainers] Starting publishInstagramContainers`
    );

    const { apiKey } = req.query;
    if (apiKey !== process.env.API_KEY) {
      req.log.error("[api/pollInstagramContainers] Invalid API key");
      res.status(204).end();
      return;
    }

    const {
      instagramContainerId,
      userId,
      facebookAccessToken,
      notionAccessToken,
      notionPageId,
      postId,
    } = req.body;

    if (
      !instagramContainerId ||
      !userId ||
      !facebookAccessToken ||
      !notionAccessToken ||
      !notionPageId ||
      !postId
    ) {
      req.log.error("[api/publishInstagramContainer] Invalid request body", {
        instagramContainerId,
        userId,
        facebookAccessToken,
        notionAccessToken,
        notionPageId,
        postId,
      });
      res.status(204).end();
      return;
    }

    const { success } = await rateLimit.instagramContentPublish.limit(userId);

    // TODO: Send email notification to user when rate limit is exceeded
    if (!success) {
      req.log.error(
        "[api/publishInstagramContainer] Facebook publish rate limit exceeded for user",
        {
          userId,
        }
      );
      res.status(204).end();
      return;
    }

    const { readyToPublish, error } = await checkInstagramContainerStatus(
      userId,
      instagramContainerId,
      facebookAccessToken,
      notionPageId,
      req.log
    );

    if (error) {
      req.log.error(
        "[api/publishInstagramContainer] Error in instagram container status",
        {
          error: error.message,
        }
      );
      res.status(204).end();
      return;
    }

    if (readyToPublish) {
      const { error: publishInstagramContainerError } =
        await publishInstagramContainer(
          userId,
          instagramContainerId,
          facebookAccessToken,
          req.log
        );

      if (publishInstagramContainerError) {
        req.log.error(
          "[api/publishInstagramContainer] Error in instagram container status",
          {
            error: publishInstagramContainerError.message,
          }
        );
        res.status(204).end();
        return;
      }

      const { error: updateNotionPageStatusError } =
        await updateNotionPageStatusToPosted(
          notionAccessToken,
          notionPageId,
          req.log
        );

      if (updateNotionPageStatusError) {
        req.log.error(
          "[api/publishInstagramContainer] Error updating notion page status",
          {
            error: updateNotionPageStatusError.message,
          }
        );
        res.status(204).end();
        return;
      }

      const { error: deleteMediaError } = await deletePostFromStorage(
        userId,
        notionPageId,
        req.log
      );

      if (deleteMediaError) {
        req.log.error(
          "[api/publishInstagramContainer] Error deleting media from supabase",
          {
            error: deleteMediaError.message,
          }
        );
        res.status(204).end();
        return;
      }

      const { error: updatePageStatusError } = await updatePageStatusToPosted(
        postId,
        req.log
      );

      if (updatePageStatusError) {
        req.log.error(
          "[api/publishInstagramContainer] Error updating page status",
          {
            error: updatePageStatusError.message,
          }
        );
        res.status(204).end();
        return;
      }
    }

    req.log.info(
      `[api/publishInstagramContainer] Completed publishInstagramContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    res.status(204).end();
  } catch (error) {
    req.log.info(
      `[api/publishInstagramContainer] Completed publishInstagramContainer endpoint`,
      {
        body: JSON.stringify(req.body),
      }
    );
    res.status(204).end();
  }
}

const checkInstagramContainerStatus = async (
  userId: string,
  containerId: string,
  accessToken: string,
  notionPageId: string,
  log: Logger
) => {
  try {
    log.info(
      "[api/publishInstagramContainer] Starting checkInstagramContainerStatus",
      {
        parameters: {
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

    log.info(
      `[api/publishInstagramContainer] Fetched current status from Facebook: ${JSON.stringify(
        json
      )}`
    );

    if (!json || !json.status_code) {
      return {
        readyToPublish: false,
        error: new Error("Invalid response from Facebook"),
      };
    }

    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      await deletePostFromStorage(userId, notionPageId, log);
      log.error("[api/publishInstagramContainer] Error publishing post", {
        parameters: {
          userId,
          containerId,
          notionPageId,
          statusCode: json.status_code,
        },
      });
      return {
        readyToPublish: false,
        error: new Error("Container is expired or errored"),
      };
    } else if (json.status_code === "IN_PROGRESS") {
      log.info("[api/publishInstagramContainer] Post still in progress", {
        parameters: {
          userId,
          containerId,
          notionPageId,
          statusCode: json.status_code,
        },
      });
      return {
        readyToPublish: false,
        error: null,
      };
    } else if (json.status_code === "PUBLISHED") {
      log.info("[api/publishInstagramContainer] Post is published", {
        parameters: {
          userId,
          containerId,
          notionPageId,
          statusCode: json.status_code,
        },
      });
      return {
        readyToPublish: false,
        error: new Error("Post already published"),
      };
    } else {
      return { readyToPublish: true, error: null };
    }
  } catch (error: any) {
    log.error(
      `[api/publishInstagramContainer] Error on checkInstagramContainerStatus`,
      {
        error: error.message,
        parameters: {
          userId,
          containerId,
          accessToken,
          notionPageId,
        },
      }
    );
    return { readToPublish: false, error };
  }
};

const publishInstagramContainer = async (
  userId: string,
  igContainerId: string,
  accessToken: string,
  log: Logger
) => {
  try {
    log.info(
      `[api/publishInstagramContainer][publishInstagramContainer]: Starting to publish instagram container with parameters: ${JSON.stringify(
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
    if (json.error) {
      return handleError(
        log,
        `[api/publishInstagramContainer][publishInstagramContainer]: Error`,
        Error(json.error.message),
        {
          userId,
          igContainerId,
        }
      );
    }

    log.info(
      `[api/publishInstagramContainer][publishInstagramContainer]: Successfully posted to Instagram with parameters ${JSON.stringify(
        {
          userId,
          igContainerId,
          accessToken,
          response: JSON.stringify(json),
        }
      )}`
    );

    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      `[api/publishInstagramContainer][publishInstagramContainer]: Error`,
      error,
      {
        userId,
        igContainerId,
      }
    );
  }
};

const deletePostFromStorage = async (
  userId: string,
  notionPageId: string,
  log: Logger
) => {
  log.info(
    `[api/publishInstagramContainer][deletePostFromStorage] Starting deletePostFromStorage`,
    {
      parameters: {
        userId,
        notionPageId,
      },
    }
  );
  try {
    const { error } = await supabaseClient.storage
      .from(userId)
      .remove([notionPageId]);
    if (error) {
      return handleError(
        log,
        "[api/publishInstagramContainer][deletePostFromStorage] Error on deletePostFromStorage",
        error,
        {
          userId,
          notionPageId,
        }
      );
    }
    log.info(
      `[api/publishInstagramContainer][deletePostFromStorage] Completed deletePostFromStorage`,
      {
        parameters: {
          userId,
          notionPageId,
        },
      }
    );
    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      "[api/publishInstagramContainer][deletePostFromStorage] Error on deletePostFromStorage",
      error,
      {
        userId,
        notionPageId,
      }
    );
  }
};

const updateNotionPageStatusToPosted = async (
  notionAccessToken: string,
  notionPageId: string,
  log: Logger
) => {
  try {
    log.info(
      "[api/publishInstagramContainer][updateNotionPageStatusToPosted] Starting updateNotionPageStatusToPosted",
      {
        parameters: {
          notionAccessToken,
          notionPageId,
        },
      }
    );
    const notion = new Client({
      auth: notionAccessToken,
    });

    const resp = await notion.pages.update({
      page_id: notionPageId,
      properties: {
        Status: {
          select: { name: "Published" },
        },
      },
    });
    if (Object.keys(resp).length === 0) {
      return handleError(
        log,
        "[api/publishInstagramContainer][updateNotionPageStatusToPosted] Error on updateNotionPageStatusToPosted",
        Error("No response from notion"),
        {
          notionAccessToken,
          notionPageId,
        }
      );
    }
    log.info(
      `[api/publishInstagramContainer][updateNotionPageStatusToPosted] Completed updateNotionPageStatusToPosted`,
      {
        parameters: {
          notionAccessToken,
          notionPageId,
        },
      }
    );
    return { error: null };
  } catch (error: any) {
    return handleError(
      log,
      "[api/publishInstagramContainer][updateNotionPageStatusToPosted] Error on updateNotionPageStatusToPosted",
      error,
      {
        notionAccessToken,
        notionPageId,
      }
    );
  }
};

const updatePageStatusToPosted = async (postId: string, log: Logger) => {
  try {
    log.info(
      `[api/publishInstagramContainer][updatePageStatusToPosted] Starting updatePageStatusToPosted `,
      {
        postId,
      }
    );

    const { error } = await supabaseClient
      .from("InstagramPosts")
      .update({ status: PostStatus.PUBLISHED })
      .eq("id", postId);

    if (error) {
      return handleError(
        log,
        "[api/publishInstagramContainer][updatePageStatusToPosted] Error on updatePageStatusToPosted",
        error,
        {
          postId,
        }
      );
    }

    log.info(
      `[api/publishInstagramContainer][updatePageStatusToPosted] Completed updatePageStatusToPosted `,
      {
        postId,
      }
    );
    return { error: null };
  } catch (error) {
    return handleError(
      log,
      "[api/publishInstagramContainer][updatePageStatusToPosted] Error on updatePageStatusToPosted",
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
