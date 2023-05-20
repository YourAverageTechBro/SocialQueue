import { verifySignature } from "@upstash/qstash/nextjs";
import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@notionhq/client";
import { InstagramPost, PostStatus } from "../../types/supabaseTypes";
import { rateLimiter } from "../../utils/utils";

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
      throw Error("No userId found");
    }
    if (!timestamp) {
      throw Error("No timestamp found");
    }

    const { error: queueUserPostsError } = await queueUserPosts(
      userId,
      timestamp,
      req
    );
    if (queueUserPostsError) throw queueUserPostsError;
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
    await rateLimiter();
    const pages = (await notion.databases.query({
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
    req.log.info(`[api/queueUserPosts] Completed fetchNotionPages`, {
      parameters: {
        user: JSON.stringify(user),
        timestamp,
      },
    });
    return { data: pages, error: null };
  } catch (error: any) {
    req.log.error(`[api/queueUserPosts] Error on fetchNotionPages`, {
      error: error.message,
      parameters: {
        user: JSON.stringify(user),
        timestamp,
      },
    });
    return { data: null, error };
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
        postsToDelete.map(async (post: { id: string }) => {
          const { error } = await deletePostFromDatabase(
            post.id,
            supabaseClient,
            req
          );
          if (error) throw error;
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
  let responseError;
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
        req.log.info(
          `[api/queueUserPosts][writePostToDatabase] Attempting to write post into database for account ${JSON.stringify(
            account
          )}`
        );
        const { error } = await supabaseClient.from("InstagramPosts").insert({
          instagram_account_id: instagramAccountId,
          access_token: accessToken,
          time_to_post: timeToPostDate.toISOString(),
          notion_page_id: notionPageId,
          status: PostStatus.QUEUED,
          user_id: userId,
        });
        if (error) throw error;
        req.log.info(
          "[api/queueUserPosts][writePostToDatabase] Successfully wrote post into database",
          {
            post: JSON.stringify({
              instagram_account_id: instagramAccountId,
              access_token: accessToken,
              time_to_post: timeToPostDate.toISOString(),
              notion_page_id: notionPageId,
              status: PostStatus.QUEUED,
              user_id: userId,
            }),
          }
        );
      })
    );
  } catch (error: any) {
    req.log.error(
      `[api/queueUserPosts][writePostToDatabase]: Failed writing post into database ${error.message}`
    );
    responseError = error;
  } finally {
    return { error: responseError };
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
    req.log.info(
      "[api/queueUserPosts] accountIdsToPostTo: ",
      accountIdsToPostTo
    );
    req.log.info("[api/queueUserPosts] queuedPostIds: ", queuedPosts);

    await Promise.all(
      queuedPosts.map(async (post: InstagramPost) => {
        if (!accountIdsToPostTo.includes(post.instagram_account_id)) {
          const { error } = await deletePostFromDatabase(
            post.id,
            supabaseClient,
            req
          );
          if (error) throw error;
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
      const { data, error } = await supabaseClient
        .from("InstagramPosts")
        .update({
          instagram_account_id: instagramAccountId,
          access_token: accessToken,
          time_to_post: timeToPostDate.toISOString(),
          notion_page_id: page.id,
          status: PostStatus.QUEUED,
          user_id: userId,
        })
        .eq("id", post.id)
        .select();
      if (error) throw error;
      req.log.info(`[api/queueUserPosts] Completed updatePostInDatabase`, {
        parameters: {
          page: JSON.stringify(page),
          socialAccountMap: JSON.stringify(socialAccountMap),
          userId,
          queuedPosts: JSON.stringify(queuedPosts),
        },
        data: JSON.stringify(data),
      });
    });
    return { error: null };
  } catch (error: any) {
    req.log.error(`[api/queueUserPosts] Error on updatePostInDatabase`, {
      error: error.message,
      parameters: {
        page: JSON.stringify(page),
        socialAccountMap: JSON.stringify(socialAccountMap),
        userId,
        queuedPosts: JSON.stringify(queuedPosts),
      },
    });
    return { error };
  }
};

const deletePostFromDatabase = async (
  postId: string,
  supabaseClient: SupabaseClient,
  req: AxiomAPIRequest
) => {
  req.log.info(`[api/queueUserPosts] Starting deletePostFromDatabase`, {
    parameters: {
      postId,
    },
  });
  try {
    req.log.info(
      `[api/queueUserPosts][deletePostFromDatabase] Attempting to delete post from database with id: ${postId}`
    );
    const { error } = await supabaseClient
      .from("InstagramPosts")
      .delete()
      .eq("id", postId);
    if (error) throw error;
    req.log.info(`[api/queueUserPosts] Completed deletePostFromDatabase`, {
      parameters: {
        postId,
      },
    });
    return { error: null };
  } catch (error: any) {
    req.log.error(`[api/queueUserPosts] Error on deletePostFromDatabase`, {
      error: error.message,
      parameters: {
        postId,
      },
    });
    return { error };
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
