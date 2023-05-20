import { RateLimit } from "async-sema";
import express, { Request, RequestHandler, Response } from "express";
import { Client } from "@notionhq/client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const app = express();

type NotionMultiSelectType = {
  id: string;
  name: string;
  color: string;
};

const router: RequestHandler = async (req: Request, res: Response) => {
  try {
    console.log(`[queue-user-posts] Starting queueUserPosts`);

    if (!req.body) {
      const msg = "no Pub/Sub message received";
      console.error(`[queue-user-posts] Error on queueUserPosts: ${msg}`);
      res.status(204).send();
      return;
    }
    if (!req.body.message) {
      const msg = "invalid Pub/Sub message format";
      console.error(`[queue-user-posts] Error on queueUserPosts: ${msg}`);
      res.status(204).send();
      return;
    }

    const pubSubMessage = JSON.parse(
      Buffer.from(req.body.message.data, "base64").toString()
    );

    console.log(
      `[queue-user-posts] Parsed pubSubMessage`,
      JSON.stringify(pubSubMessage)
    );

    const { userId, timestamp } = pubSubMessage;
    if (!userId) {
      throw Error("No userId found");
    }
    if (!timestamp) {
      throw Error("No timestamp found");
    }

    const { error: queueUserPostsError } = await queueUserPosts(
      userId,
      timestamp
    );
    if (queueUserPostsError) throw queueUserPostsError;
    console.log(`[queue-user-posts] Completed queueUserPosts`);
    res.status(204).send();
  } catch (error: any) {
    console.error("[queue-user-posts] Error:", error.message);
    res.status(204).send();
  }
};

const queueUserPosts = async (userId: string, timestamp: string) => {
  try {
    console.error(`[queue-user-posts] Starting queueUserPosts`, {
      parameters: { userId, timestamp },
    });
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default when deployed.
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );

    const { data: user, error: fetchUserError } = await fetchUser(
      userId,
      supabaseClient
    );

    if (fetchUserError) throw fetchUserError;
    if (!user) throw Error("No user found");

    const { data: socialAccountMap, error: socialAccountMapError } =
      constructUserSocialAccountMap(user);

    if (socialAccountMapError) throw socialAccountMapError;

    // Return early because user has no social accounts connected
    if (!socialAccountMap || Object.keys(socialAccountMap).length === 0) {
      return { error: null };
    }

    const { data: pages, error: fetchNotionPagesError } =
      await fetchNotionPages(user, timestamp);
    if (fetchNotionPagesError) throw fetchNotionPagesError;
    if (!pages) throw Error("Pages is empty");

    const { data: currentlyQueuedPosts, error: currentlyQueuedPostsError } =
      await fetchCurrentlyQueuedInstagramPosts(userId, supabaseClient);

    if (currentlyQueuedPostsError) throw currentlyQueuedPostsError;
    if (currentlyQueuedPosts === undefined)
      throw Error("Currently queued posts is undefined");

    const { error } = await processPages(
      pages,
      socialAccountMap,
      supabaseClient,
      userId,
      currentlyQueuedPosts
    );
    if (error) throw error;
    console.log(`[queue-user-posts] Completed queueUserPosts`, {
      parameters: { userId, timestamp },
    });
    return { error: null };
  } catch (error: any) {
    console.error(`[queue-user-posts] Error on queueUserPosts`, {
      error: error.message,
      parameters: { userId, timestamp },
    });
    return { error };
  }
};

const fetchUser = async (userId: string, supabaseClient: SupabaseClient) => {
  try {
    console.log(`[queue-user-posts] Starting fetchUser`, {
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
    console.log(`[queue-user-posts] Completed fetchUser`, {
      parameters: { userId },
      data: JSON.stringify(data),
    });
    return { data: data[0], error: null };
  } catch (error: any) {
    console.error(`[queue-user-posts] Error on fetchUser`, {
      error: error.message,
      parameters: { userId },
    });
    return { data: null, error };
  }
};

// TODO: Add type for user
const constructUserSocialAccountMap = (user: any) => {
  try {
    console.log(`[queue-user-posts] Starting constructUserSocialAccountMap`, {
      parameters: { user: JSON.stringify(user) },
    });
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

    console.log(
      `[queue-user-posts][constructUserSocialAccountMap] created socialAccountMap: ${JSON.stringify(
        socialAccountMap
      )}`
    );

    if (Object.keys(socialAccountMap).length === 0) {
      console.log(
        "[queue-user-posts][constructUserSocialAccountMap] No social accounts found for user ",
        user.id
      );
    } else {
      console.log(`[queue-user-posts] Starting constructUserSocialAccountMap`, {
        parameters: { user: JSON.stringify(user) },
        data: JSON.stringify(socialAccountMap),
      });
    }
    return { data: socialAccountMap, error: null };
  } catch (error: any) {
    console.log("[queue-user-posts] Error on constructUserSocialAccountMap", {
      error: error.message,
      parameters: {
        user: JSON.stringify(user),
      },
    });
    return { data: null, error };
  }
};

const fetchNotionPages = async (user: any, timestamp: string) => {
  console.log(`[queue-user-posts] Starting fetchNotionPages`, {
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
    console.log(`[queue-user-posts] Completed fetchNotionPages`, {
      parameters: {
        user: JSON.stringify(user),
        timestamp,
      },
      data: JSON.stringify(pages),
    });
    return { data: pages, error: null };
  } catch (error: any) {
    console.error(`[queue-user-posts] Error on fetchNotionPages`, {
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
  currentlyQueuedPosts: InstagramPost[]
) => {
  console.log(`[queue-user-posts] Started processPages`, {
    parameters: {
      pages: JSON.stringify(pages),
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

        const alreadyQueuedPosts = currentlyQueuedPosts.filter(
          (post) => post.notion_page_id === pageId
        );
        if (alreadyQueuedPosts.length > 0) {
          const { error } = await updatePostInDatabase(
            page,
            socialAccountMap,
            supabaseClient,
            userId,
            alreadyQueuedPosts
          );

          if (error) throw error;
        } else {
          const { error } = await writePostToDatabase(
            pageId,
            supabaseClient,
            userId,
            page,
            socialAccountMap
          );
          if (error) throw error;
        }
      })
    );

    const postsToDelete = currentlyQueuedPosts.filter(
      (post: InstagramPost) => !visitedPostPageIds.has(post.notion_page_id)
    );

    await Promise.all(
      postsToDelete.map(async (post: { id: string }) => {
        const { error } = await deletePostFromDatabase(post.id, supabaseClient);
        if (error) throw error;
      })
    );

    console.log(`[queue-user-posts] Completed processPages`, {
      parameters: {
        pages: JSON.stringify(pages),
        userId,
        socialAccountMap: JSON.stringify(socialAccountMap),
        currentlyQueuedPosts: JSON.stringify(currentlyQueuedPosts),
      },
    });

    return { error: null };
  } catch (error: any) {
    console.error(`[queue-user-posts] Error on processPages`, {
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
  >
) => {
  let responseError;
  try {
    console.log(`[queue-user-posts] Starting writePostInDatabase `, {
      parameters: {
        notionPageId,
        userId,
        page,
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
        console.log(
          `[queue-user-posts][writePostToDatabase] Attempting to write post into database for account ${JSON.stringify(
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
        console.log(
          "[queue-user-posts][writePostToDatabase] Successfully wrote post into database",
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
    console.error(
      `[queue-user-posts][writePostToDatabase]: Failed writing post into database ${error.message}`
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
  queuedPosts: InstagramPost[]
) => {
  try {
    console.log(`[queue-user-posts] Starting updatePostInDatabase`, {
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
    console.log("[queue-user-posts] accountIdsToPostTo: ", accountIdsToPostTo);
    console.log("[queue-user-posts] queuedPostIds: ", queuedPosts);

    await Promise.all(
      queuedPosts.map(async (post: InstagramPost) => {
        if (!accountIdsToPostTo.includes(post.instagram_account_id)) {
          const { error } = await deletePostFromDatabase(
            post.id,
            supabaseClient
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
      console.log(`[queue-user-posts] Completed updatePostInDatabase`, {
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
    console.error(`[queue-user-posts] Error on updatePostInDatabase`, {
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
  supabaseClient: SupabaseClient
) => {
  console.log(`[queue-user-posts] Starting deletePostFromDatabase`, {
    parameters: {
      postId,
    },
  });
  try {
    console.log(
      `[queue-user-posts][deletePostFromDatabase] Attempting to delete post from database with id: ${postId}`
    );
    const { error } = await supabaseClient
      .from("InstagramPosts")
      .delete()
      .eq("id", postId);
    if (error) throw error;
    console.log(`[queue-user-posts] Completed deletePostFromDatabase`, {
      parameters: {
        postId,
      },
    });
    return { error: null };
  } catch (error: any) {
    console.error(`[queue-user-posts] Error on deletePostFromDatabase`, {
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
  supabaseClient: SupabaseClient
) => {
  let responseData;
  let responseError;
  try {
    console.log(
      `[queue-user-posts] Starting fetchCurrentlyQueueInstagramPosts`,
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
      .neq("status", PostStatus.QUEUED);
    if (error) throw error;
    console.log(
      `[queue-user-posts] Completed fetchCurrentlyQueueInstagramPosts`,
      {
        parameters: {
          userId,
        },
        data: JSON.stringify(data),
      }
    );
    responseData = data as InstagramPost[];
  } catch (error: any) {
    console.error(
      `[queue-user-posts] Error on fetchCurrentlyQueueInstagramPosts`,
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

export enum PostStatus {
  QUEUED = "QUEUED",
}

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
};

export const rateLimiter = RateLimit(1, {
  timeUnit: 1000,
  uniformDistribution: true,
});
app.use(express.json());
app.use("/", router);

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`[queue-user-ids]: listening on port ${port}`);
});
