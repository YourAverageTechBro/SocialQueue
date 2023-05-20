import { Client as QStashClient } from "@upstash/qstash";
import type { NextApiResponse } from "next";
import { AxiomAPIRequest, withAxiom } from "next-axiom";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { InstagramPost, PostStatus } from "../../types/supabaseTypes";
import { updateInstagramPostStatus } from "../../utils/utils";
import { Client } from "@notionhq/client";
import { ListBlockChildrenResponse } from "@notionhq/client/build/src/api-endpoints";
import { verifySignature } from "@upstash/qstash/nextjs";

// TODO: clean up this file with better logging too
async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    if (req.method === "POST") {
      req.log.info("[api/notionPage] Starting POST endpoint");

      const { userId, post } = req.body;
      if (!post) throw Error("No post found in request body");
      if (!userId) throw Error("No userId found in request body");

      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
      );

      const { error: updateInstagramPostStatusError } =
        await updateInstagramPostStatus(
          post.id,
          supabaseClient,
          PostStatus.PROCESSING,
          "api/notionPage",
          req
        );
      if (updateInstagramPostStatusError) throw updateInstagramPostStatusError;
      const { error } = await processNotionPage(
        post,
        userId,
        supabaseClient,
        req
      );
      if (error) throw error;
      req.log.info("[api/notionPage] Completed POST endpoint");
      res.status(204).end();
    }
  } catch (error: any) {
    req.log.error(`[api/notionPage] Error: ${error.message}`);
    res.status(204).end();
  }
}

const processNotionPage = async (
  instagramPost: InstagramPost,
  userId: string,
  supabaseClient: SupabaseClient,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[api/notionPage] Starting to process notion page`, {
      parameters: {
        instagramPost: JSON.stringify(instagramPost),
        userId,
      },
    });

    req.log.info(`[api/notionPage] Attempting to fetch user from supabase`, {
      parameters: {
        userId,
      },
    });
    const { data: supabaseData, error } = await supabaseClient
      .from("Users")
      .select(
        `id,
        notion_access_token, 
        notion_duplicated_template_id,
        SocialAccounts (
            social_id,
            access_token,
            username,
            social_platform
        )
    `
      )
      .eq("id", userId);
    req.log.info(`[api/notionPage] Fetched user from supabase`, {
      parameters: {
        userId,
      },
      data: JSON.stringify(supabaseData),
    });
    if (error) throw error;
    if (supabaseData.length > 1) {
      throw Error("Found more than one user with the id");
    }
    if (supabaseData.length === 0) {
      throw Error("Could not find user with that id");
    }
    const user = supabaseData[0];
    const notionAccessToken = user.notion_access_token;

    const { data: socialAccount, error: fetchSocialAccountError } =
      fetchSocialAccount(user, instagramPost, req);

    if (fetchSocialAccountError) {
      throw fetchSocialAccountError;
    }

    const { data: pageBlocks, error: notionPageBlocksError } =
      await fetchNotionPageBlocks(notionAccessToken, instagramPost, req);
    if (notionPageBlocksError) throw notionPageBlocksError;
    if (!pageBlocks)
      throw Error(
        `Notion page block from page id ${instagramPost.notion_page_id} came back empty`
      );

    const { data, error: postingInfoError } =
      await getPostingInfoFromNotionPage(pageBlocks, req);
    if (postingInfoError) throw postingInfoError;
    if (!data) throw Error("Posting info came back empty");

    const { caption, photoUrls, videoUrls } = data;
    if (!photoUrls || !videoUrls) throw Error("photo or video url is empty");

    const c = new QStashClient({
      token: process.env.QSTASH_TOKEN ?? "",
    });

    const res = await c.publishJSON({
      url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/mediaUpload`,
      // or topic: "the name or id of a topic"
      body: {
        userId,
        caption,
        photoUrls,
        videoUrls,
        socialAccount,
        notionAccessToken,
        instagramPost,
      },
      retries: 0,
    });

    req.log.info(`[api/notionPage] Post ${res.messageId} published`);

    return { error: null };
  } catch (error: any) {
    req.log.error(
      `[api/notionPage] Error on processNotionPage: ${error.message}`
    );
    return { error: error.message };
  }
};

const fetchSocialAccount = (
  user: any,
  instagramPost: InstagramPost,
  req: AxiomAPIRequest
) => {
  try {
    req.log.info(`[api/notionPage] Starting fetchSocialAccount`, {
      parameters: {
        user: JSON.stringify(user),
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    let socialAccount = null;
    if (Array.isArray(user["SocialAccounts"])) {
      socialAccount = user["SocialAccounts"].find(
        (account: any) =>
          account.social_id === instagramPost.instagram_account_id &&
          account.social_platform === "instagram"
      );
    } else if (
      user["SocialAccounts"] &&
      user["SocialAccounts"].social_platform === "instagram" &&
      user["SocialAccounts"].social_id === instagramPost.instagram_account_id
    ) {
      socialAccount = user["SocialAccounts"];
    }
    if (!socialAccount) throw Error("Social account not found");
    req.log.info(`[api/notionPage] Completed fetchSocialAccount`, {
      data: JSON.stringify(socialAccount),
      parameters: {
        user: JSON.stringify(user),
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    return { data: socialAccount, error: null };
  } catch (error: any) {
    req.log.info(`[api/notionPage] Error on fetchSocialAccount`, {
      error: error.message,
      parameters: {
        user: JSON.stringify(user),
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    return { data: null, error: error.message };
  }
};

const fetchNotionPageBlocks = async (
  notionAccessToken: string,
  instagramPost: InstagramPost,
  req: AxiomAPIRequest
) => {
  let data;
  try {
    req.log.info(`[api/notionPage] Starting fetchNotionPageBlocks`, {
      parameters: {
        notionAccessToken,
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    const notion = new Client({
      auth: notionAccessToken,
    });

    const page = await notion.pages.retrieve({
      page_id: instagramPost.notion_page_id,
    });

    if (Object.keys(page).length === 0) throw Error("Page not found");

    const pageId = page.id;

    const pageBlocks = await notion.blocks.children.list({
      block_id: pageId,
    });
    if (Object.keys(pageBlocks).length === 0) throw Error("Blocks not found");
    data = pageBlocks;

    req.log.info(`[api/notionPage] Completed fetchNotionPageBlocks`, {
      data: JSON.stringify(data),
      parameters: {
        notionAccessToken,
        instagramPost: JSON.stringify(instagramPost),
      },
    });

    return { data, error: null };
  } catch (error: any) {
    req.log.error(`[api/notionPage] Error on fetchNotionPageBlocks`, {
      error: error.message,
      parameters: {
        notionAccessToken,
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    return { data: null, error: error };
  }
};

const getPostingInfoFromNotionPage = async (
  pageBlocks: ListBlockChildrenResponse,
  req: AxiomAPIRequest
) => {
  req.log.info("[api/notionPage] Starting getPostingInfoFromNotionPage", {
    parameters: {
      pageBlocks: JSON.stringify(pageBlocks),
    },
  });
  let caption = "";
  let photoUrls: string[] = [];
  let videoUrls: string[] = [];
  try {
    pageBlocks.results.forEach((element: any) => {
      if (element.paragraph && element.paragraph.rich_text) {
        element.paragraph.rich_text.forEach((richText: any) => {
          caption += richText.plain_text;
        });
      } else if (element.video) {
        videoUrls.push(element.video.file.url);
      } else if (element.image) {
        photoUrls.push(element.image.file.url);
      }
    });
    caption = caption.replaceAll("#", "%23"); // %23 is the hashtag character
    if (videoUrls.length === 0 && photoUrls.length === 0)
      throw Error("Media urls are empty");
    return {
      data: {
        caption,
        photoUrls,
        videoUrls,
      },
      error: null,
    };
  } catch (error: any) {
    req.log.error(`[api/notionPage] Error on getPostingInfoFromNotionPage`, {
      error: error.message,
      parameters: {
        pageBlocks: JSON.stringify(pageBlocks),
      },
    });
    return { data: null, error };
  }
};

// @ts-ignore
export default withAxiom(verifySignature(handler));

export const config = {
  api: {
    bodyParser: false,
  },
};
