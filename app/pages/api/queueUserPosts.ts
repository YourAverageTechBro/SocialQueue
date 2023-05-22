import { verifySignature } from "@upstash/qstash/nextjs";
import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@notionhq/client";
import { InstagramPost, PostStatus } from "../../types/supabaseTypes";
import { handleError, qStashClient, rateLimit } from "../../utils/utils";

type NotionMultiSelectType = {
  id: string;
  name: string;
  color: string;
};

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(`[api/queueUserPosts] Starting queueUserPosts endpoint`, {
      body: JSON.stringify(req.body),
    });
    const { userId, timestamp } = req.body;
    if (!userId) {
      req.log.error("[api/queueUserPosts] Error: No user id found");
      res.status(204).end();
      return;
    }
    if (!timestamp) {
      req.log.error("[api/queueUserPosts] Error: No timestamp here");
      res.status(204).end();
      return;
    }

    const { error: queueUserPostsError } = await queueUserPosts(
      userId,
      timestamp,
      req
    );

    if (queueUserPostsError) {
      // Retry if rate limited
      if (queueUserPostsError.message === "Ratelimit") {
        res.status(504).end();
        return;
      }
      req.log.error(
        `[api/queueUserPosts] Error: ${queueUserPostsError.message}`
      );
      res.status(204).end();
      return;
    }

    req.log.info(`[api/queueUserPosts] Completed queueUserPosts endpoint`, {
      body: JSON.stringify(req.body),
    });
    res.status(204).end();
  } catch (error: any) {
    req.log.error("[api/queueUserPosts] Error:", error.message);
    res.status(204).end();
  }
}

const queueUserPosts = async (
  userId: string,
  timestamp: string,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[api/queueUserPosts] Starting queueUserPosts`, {
      parameters: { userId, timestamp },
    });
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default when deployed.
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );

    const { data: user, error: fetchUserError } = await fetchUser(
      userId,
      supabaseClient,
      req
    );

    if (fetchUserError) throw fetchUserError;
    if (!user) throw Error("No user found");

    const { data: socialAccountMap, error: socialAccountMapError } =
      constructUserSocialAccountMap(user, req);

    if (socialAccountMapError) throw socialAccountMapError;

    // Return early because user has no social accounts connected
    if (!socialAccountMap || Object.keys(socialAccountMap).length === 0) {
      return { error: null };
    }

    const { data: pages, error: fetchNotionPagesError } =
      await fetchNotionPages(user, timestamp, req);
    if (fetchNotionPagesError) throw fetchNotionPagesError;
    // Return early because no notion pages that are ready
    if (!pages) return { error: null };

    const { data: currentlyQueuedPosts, error: currentlyQueuedPostsError } =
      await fetchCurrentlyQueuedInstagramPosts(userId, supabaseClient, req);

    if (currentlyQueuedPostsError) throw currentlyQueuedPostsError;

    const { error } = await processPages(
      pages,
      socialAccountMap,
      supabaseClient,
      userId,
      currentlyQueuedPosts,
      req
    );
    if (error) throw error;
    req.log.info(`[api/queueUserPosts] Completed queueUserPosts`, {
      parameters: { userId, timestamp },
    });
    return { error: null };
  } catch (error: any) {
    req.log.error(`[api/queueUserPosts] Error on queueUserPosts`, {
      error: error.message,
      parameters: { userId, timestamp },
    });
    return { error };
  }
};

const fetchUser = async (
  userId: string,
  supabaseClient: SupabaseClient,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[api/queueUserPosts] Starting fetchUser`, {
      parameters: { userId },
    });
    const { data, error } = await supabaseClient
      .from("Users")
      .select(
        `notion_access_token, 
    notion_duplicated_template_id,
    SocialAccounts (
      social_id,
      access_token,
      username,
      social_platform
    )
    `
      )
      .eq("id", userId)
      .neq("notion_access_token", null)
      .neq("notion_duplicated_template_id", null);

    if (error) throw error;
    if (data.length === 0) throw Error("No user found");
    if (data.length > 1) throw Error("More than one user found");
    req.log.info(`[api/queueUserPosts] Completed fetchUser`, {
      parameters: { userId },
      data: JSON.stringify(data),
    });
    return { data: data[0], error: null };
  } catch (error: any) {
    req.log.error(`[api/queueUserPosts] Error on fetchUser`, {
      error: error.message,
      parameters: { userId },
    });
    return { data: null, error };
  }
};

// TODO: Add type for user
const constructUserSocialAccountMap = (user: any, req: AxiomAPIRequest) => {
  try {
    req.log.info(
      `[api/queueUserPosts] Starting constructUserSocialAccountMap`,
      {
        parameters: { user: JSON.stringify(user) },
      }
    );
    let socialAccountMap: Record<string, any> = {};
    if (Array.isArray(user["SocialAccounts"])) {
      user["SocialAccounts"].forEach((account: any) => {
        const username = account["username"] as string;
        const platform = account["social_platform"] as string;
        const key = `${username}-${platform}`;
        socialAccountMap[key] = {
          social_id: account["social_id"],
          access_token: account["access_token"],
        };
      });
    } else if (user["SocialAccounts"]) {
      const account = user["SocialAccounts"];
      const username = account["username"] as string;
      const platform = account["social_platform"] as string;
      const key = `${username}-${platform}`;
      socialAccountMap[key] = {
        social_id: account["social_id"],
        access_token: account["access_token"],
      };
    }

    req.log.info(
      `[api/queueUserPosts][constructUserSocialAccountMap] created socialAccountMap: ${JSON.stringify(
        socialAccountMap
      )}`
    );

    if (Object.keys(socialAccountMap).length === 0) {
      req.log.info(
        "[api/queueUserPosts][constructUserSocialAccountMap] No social accounts found for user ",
        user.id
      );
    } else {
      req.log.info(
        `[api/queueUserPosts] Starting constructUserSocialAccountMap`,
        {
          parameters: { user: JSON.stringify(user) },
          data: JSON.stringify(socialAccountMap),
        }
      );
    }
    return { data: socialAccountMap, error: null };
  } catch (error: any) {
    req.log.info(
      "[api/queueUserPosts] Error on constructUserSocialAccountMap",
      {
        error: error.message,
        parameters: {
          user: JSON.stringify(user),
        },
      }
    );
    return { data: null, error };
  }
};

const fetchNotionPages = async (
  user: any,
  timestamp: string,
  req: AxiomAPIRequest
) => {
  req.log.info(`[api/queueUserPosts] Starting fetchNotionPages`, {
    parameters: {
      user: JSON.stringify(user),
      timestamp,
    },
  });
  try {
    const notionAccessToken = user["notion_access_token"];
    const notionDuplicatedTemplateId = user["notion_duplicated_template_id"];
    const notion = new Client({
      auth: notionAccessToken,
    });

    const { success } = await rateLimit.notionApi.limit("api");

    if (!success) {
      return handleError(
        req.log,
        `[api/queueUserPosts] Error on fetchNotionPages`,
        new Error("Ratelimit"),
        {
          user: JSON.stringify(user),
          timestamp,
        }
      );
    }

    const resp = (await notion.databases.query({
      database_id: notionDuplicatedTemplateId,
      filter: {
        and: [
          {
            property: "Status",
            select: {
              equals: "Ready",
            },
          },
          {
            property: "Publication date",
            date: {
              on_or_after: timestamp,
            },
          },
        ],
      },
    })) as any;

    if (resp.status === 429) {
      return handleError(
        req.log,
        `[api/queueUserPosts] Notion API rate limit reached`,
        new Error("Ratelimit"),
        {
          user: JSON.stringify(user),
          timestamp,
        }
      );
    }

    req.log.info(`[api/queueUserPosts] Completed fetchNotionPages`, {
      parameters: {
        user: JSON.stringify(user),
        timestamp,
      },
    });
    return { data: resp, error: null };
  } catch (error: any) {
    return handleError(
      req.log,
      `[api/queueUserPosts] Error on fetchNotionPages`,
      error,
      {
        user: JSON.stringify(user),
        timestamp,
      }
    );
  }
};

const processPages = async (
  pages: any,
  socialAccountMap: Record<string, any>,
  supabaseClient: SupabaseClient,
  userId: string,
  currentlyQueuedPosts: InstagramPost[] | undefined,
  req: AxiomAPIRequest
) => {
  req.log.info(`[api/queueUserPosts] Started processPages`, {
    parameters: {
      userId,
      socialAccountMap: JSON.stringify(socialAccountMap),
      currentlyQueuedPosts: JSON.stringify(currentlyQueuedPosts),
    },
  });
  let visitedPostPageIds = new Set();
  try {
    await Promise.all(
      pages.results.map(async (page: any) => {
        const pageId = page.id;

        visitedPostPageIds.add(pageId);

        const alreadyQueuedPosts = currentlyQueuedPosts?.filter(
          (post) => post.notion_page_id === pageId
        );
        if (alreadyQueuedPosts && alreadyQueuedPosts.length > 0) {
          const { error } = await updatePostInDatabase(
            page,
            socialAccountMap,
            supabaseClient,
            userId,
            alreadyQueuedPosts,
            req
          );

          if (error) throw error;
        } else {
          const { error } = await writePostToDatabase(
            pageId,
            supabaseClient,
            userId,
            page,
            socialAccountMap,
            req
          );
          if (error) throw error;
        }
      })
    );

    if (currentlyQueuedPosts) {
      const postsToDelete = currentlyQueuedPosts.filter(
        (post: InstagramPost) => !visitedPostPageIds.has(post.notion_page_id)
      );

      await Promise.all(
        postsToDelete.map(async (post: InstagramPost) => {
          const res = await qStashClient.publishJSON({
            url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/deleteSocialPost?apiKey=${process.env.API_KEY}`,
            // or topic: "the name or id of a topic"
            body: {
              postId: post.id,
            },
            retries: 0,
          });

          req.log.info(
            `[api/queueUserPosts] Successfully sent delete request for message ${res.messageId}`
          );
        })
      );
    }

    req.log.info(`[api/queueUserPosts] Completed processPages`, {
      parameters: {
        userId,
        socialAccountMap: JSON.stringify(socialAccountMap),
        currentlyQueuedPosts: JSON.stringify(currentlyQueuedPosts),
      },
    });

    return { error: null };
  } catch (error: any) {
    req.log.error(`[api/queueUserPosts] Error on processPages`, {
      error: error.message,
      parameters: {
        pages: JSON.stringify(pages),
        userId,
        socialAccountMap: JSON.stringify(socialAccountMap),
        currentlyQueuedPosts: JSON.stringify(currentlyQueuedPosts),
      },
    });
    return { error };
  }
};

const writePostToDatabase = async (
  notionPageId: string,
  supabaseClient: SupabaseClient,
  userId: string,
  page: any,
  socialAccountMap: Record<
    string,
    {
      social_id: string;
      access_token: string;
    }
  >,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[api/queueUserPosts] Starting writePostInDatabase `, {
      parameters: {
        notionPageId,
        userId,
        socialAccountMap,
      },
    });
    const accountsToPostTo =
      page.properties["Social media account"].multi_select;
    const publicationDate = page.properties["Publication date"].date;

    // TODO: Add support for photos + carousels
    await Promise.all(
      accountsToPostTo.map(async (account: NotionMultiSelectType) => {
        const { social_id: instagramAccountId, access_token: accessToken } =
          socialAccountMap[account.name];

        const timeToPostDate = new Date(publicationDate.start);

        const res = await qStashClient.publishJSON({
          url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/createSocialPost?apiKey=${process.env.API_KEY}`,
          // or topic: "the name or id of a topic"
          body: {
            publicationDate: timeToPostDate.toISOString(),
            instagramAccountId,
            accessToken,
            pageId: page.id,
            userId,
          },
          retries: 0,
        });

        req.log.info(
          `[api/queueUserPosts] Successfully sent message ${res.messageId}`
        );
      })
    );

    return { error: null };
  } catch (error: any) {
    return handleError(
      req.log,
      `[api/queueUserPosts][writePostToDatabase]: Failed writing post into database`,
      error,
      {
        notionPageId,
        userId,
        socialAccountMap,
      }
    );
  }
};

const updatePostInDatabase = async (
  page: any,
  socialAccountMap: Record<
    string,
    {
      social_id: string;
      access_token: string;
    }
  >,
  supabaseClient: SupabaseClient,
  userId: string,
  queuedPosts: InstagramPost[],
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[api/queueUserPosts] Starting updatePostInDatabase`, {
      parameters: {
        page: JSON.stringify(page),
        socialAccountMap: JSON.stringify(socialAccountMap),
        userId,
        queuedPosts: JSON.stringify(queuedPosts),
      },
    });
    const accountsToPostTo =
      page.properties["Social media account"].multi_select;
    const publicationDate = page.properties["Publication date"].date;
    const accountIdsToPostTo = accountsToPostTo.map(
      (account: NotionMultiSelectType) => {
        if (socialAccountMap[account.name]) {
          return socialAccountMap[account.name].social_id;
        }
      }
    );

    await Promise.all(
      queuedPosts.map(async (post: InstagramPost) => {
        if (!accountIdsToPostTo.includes(post.instagram_account_id)) {
          const res = await qStashClient.publishJSON({
            url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/deleteSocialPost?apiKey=${process.env.API_KEY}`,
            // or topic: "the name or id of a topic"
            body: {
              postId: post.id,
            },
            retries: 0,
          });

          req.log.info(
            `[api/queueUserPosts] Successfully sent delete request for message ${res.messageId}`
          );
        }
      })
    );

    accountsToPostTo.map(async (account: NotionMultiSelectType) => {
      const { social_id: instagramAccountId, access_token: accessToken } =
        socialAccountMap[account.name];

      const post = queuedPosts.find(
        (post) => post.instagram_account_id === instagramAccountId
      );

      if (!post) return;

      const timeToPostDate = new Date(publicationDate.start);

      const res = await qStashClient.publishJSON({
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/updateSocialPost?apiKey=${process.env.API_KEY}`,
        // or topic: "the name or id of a topic"
        body: {
          publicationDate: timeToPostDate.toISOString(),
          instagramAccountId,
          accessToken,
          pageId: page.id,
          userId,
          postId: post.id,
        },
        retries: 0,
      });

      req.log.info(
        `[api/queueUserPosts] Successfully sent update request for message ${res.messageId}`
      );
    });
    return { error: null };
  } catch (error: any) {
    return handleError(
      req.log,
      `[api/queueUserPosts] Error on updatePostInDatabase`,
      error,
      {
        page: JSON.stringify(page),
        socialAccountMap: JSON.stringify(socialAccountMap),
        userId,
        queuedPosts: JSON.stringify(queuedPosts),
      }
    );
  }
};

const fetchCurrentlyQueuedInstagramPosts = async (
  userId: string,
  supabaseClient: SupabaseClient,
  req: AxiomAPIRequest
) => {
  let responseData;
  let responseError;
  try {
    req.log.info(
      `[api/queueUserPosts] Starting fetchCurrentlyQueueInstagramPosts`,
      {
        parameters: {
          userId,
        },
      }
    );
    const { data, error } = await supabaseClient
      .from("InstagramPosts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", PostStatus.QUEUED);
    if (error) throw error;
    req.log.info(
      `[api/queueUserPosts] Completed fetchCurrentlyQueueInstagramPosts`,
      {
        parameters: {
          userId,
        },
        data: JSON.stringify(data),
      }
    );
    responseData = data;
  } catch (error: any) {
    req.log.error(
      `[api/queueUserPosts] Error on fetchCurrentlyQueueInstagramPosts`,
      {
        error: error.message,
        parameters: {
          userId,
        },
      }
    );
    responseError = error;
  } finally {
    return { data: responseData, error: responseError };
  }
};

// @ts-ignore
export default withAxiom(verifySignature(handler));

export const config = {
  api: {
    bodyParser: false,
  },
};
