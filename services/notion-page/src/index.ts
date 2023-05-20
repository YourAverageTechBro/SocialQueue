import { Client } from "@notionhq/client";
import { PubSub } from "@google-cloud/pubsub";
import express, { Request, RequestHandler, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { ListBlockChildrenResponse } from "@notionhq/client/build/src/api-endpoints";

type InstagramPost = {
  id: number;
  created_at: string;
  user_id: string;
  post_url?: string;
  status: string;
  post_id?: string;
  notion_page_id: string;
  time_to_post: string;
  caption?: string;
  access_token: string;
  media_urls: string[];
  instagram_account_id: string;
  media_type: string;
};

const app = express();

const router: RequestHandler = async (req: Request, res: Response) => {
  try {
    if (req.method === "POST") {
      console.log("[notion-page] Starting POST endpoint");

      if (!req.body) {
        const msg = "no Pub/Sub message received";
        console.error(`[notion-page] Error on POST endpoint: ${msg}`);
        res.status(204).send(`Bad Request: ${msg}`);
        return;
      }
      if (!req.body.message) {
        const msg = "invalid Pub/Sub message format";
        console.error(`[notion-page] Error on POST endpoint: ${msg}`);
        res.status(204).send(`Bad Request: ${msg}`);
        return;
      }

      const pubSubMessage = req.body.message;
      const { userId, post } = JSON.parse(
        Buffer.from(pubSubMessage.data, "base64").toString()
      );

      if (!post) throw Error("No post found in request body");
      if (!userId) throw Error("No userId found in request body");
      const { error } = await processNotionPage(post, userId);
      if (error) throw error;
      console.log("[notion-page] Completed POST endpoint");
      res.status(204).send();
    }
  } catch (error: any) {
    console.error(`[notion-page] Error: ${error.message}`);
    res.status(204).send();
  }
};

const processNotionPage = async (
  instagramPost: InstagramPost,
  userId: string
) => {
  try {
    console.log(`[notion-page] Starting to process notion page`, {
      parameters: {
        instagramPost: JSON.stringify(instagramPost),
        userId,
      },
    });
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );

    console.log(`[notion-page] Attempting to fetch user from supabase`, {
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
    console.log(`[notion-page] Fetched user from supabase`, {
      parameters: {
        userId,
      },
      data: JSON.stringify(supabaseData),
    });
    if (error) throw error;
    if (supabaseData.length > 1)
      throw Error("Found more than one user with the id");
    if (supabaseData.length === 0)
      throw Error("Could not find user with that id");
    const user = supabaseData[0];
    const notionAccessToken = user.notion_access_token;

    const { data: socialAccount, error: fetchSocialAccountError } =
      fetchSocialAccount(user, instagramPost);

    if (fetchSocialAccountError) throw fetchSocialAccountError;

    const { data: pageBlocks, error: notionPageBlocksError } =
      await fetchNotionPageBlocks(notionAccessToken, instagramPost);
    if (notionPageBlocksError) throw notionPageBlocksError;
    if (!pageBlocks)
      throw Error(
        `Notion page block from page id ${instagramPost.notion_page_id} came back empty`
      );

    const { data, error: postingInfoError } =
      await getPostingInfoFromNotionPage(pageBlocks);
    if (postingInfoError) throw postingInfoError;
    if (!data) throw Error("Posting info came back empty");

    const { caption, photoUrls, videoUrls } = data;
    if (!photoUrls || !videoUrls) throw Error("photo or video url is empty");

    const pubSubClient = new PubSub();
    const topicName = "projects/socialqueue-374118/topics/notion-page";
    const dataBuffer = Buffer.from(
      JSON.stringify({
        userId,
        caption,
        photoUrls,
        videoUrls,
        socialAccount,
        notionAccessToken,
        instagramPost,
      })
    );

    const messageId = await pubSubClient
      .topic(topicName)
      .publishMessage({ data: dataBuffer });
    console.log(`[notion-page] Post ${messageId} published to ${topicName}`);

    return { error: null };
  } catch (error: any) {
    console.error(`[notion-page] Error on processNotionPage: ${error.message}`);
    return { error: error.message };
  }
};

const fetchSocialAccount = (user: any, instagramPost: InstagramPost) => {
  try {
    console.log(`[notion-page] Starting fetchSocialAccount`, {
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
    } else if (user["SocialAccounts"]) {
      if (
        user["SocialAccounts"].social_platform === "instagram" &&
        user["SocialAccounts"].social_id === instagramPost.instagram_account_id
      ) {
        socialAccount = user["SocialAccounts"];
      }
    }
    if (!socialAccount) throw Error("Social account not found");
    console.log(`[notion-page] Completed fetchSocialAccount`, {
      data: JSON.stringify(socialAccount),
      parameters: {
        user: JSON.stringify(user),
        instagramPost: JSON.stringify(instagramPost),
      },
    });
    return { data: socialAccount, error: null };
  } catch (error: any) {
    console.log(`[notion-page] Error on fetchSocialAccount`, {
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
  instagramPost: InstagramPost
) => {
  let data;
  try {
    console.log(`[notion-page] Starting fetchNotionPageBlocks`, {
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

    console.log(`[notion-page] Completed fetchNotionPageBlocks`, {
      data: JSON.stringify(data),
      parameters: {
        notionAccessToken,
        instagramPost: JSON.stringify(instagramPost),
      },
    });

    return { data, error: null };
  } catch (error: any) {
    console.error(`[notion-page] Error on fetchNotionPageBlocks`, {
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
  pageBlocks: ListBlockChildrenResponse
) => {
  console.log("[notion-page] Starting getPostingInfoFromNotionPage", {
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
      }
      if (element.video) {
        videoUrls.push(element.video.file.url);
      }
      if (element.image) {
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
    console.error(`[notion-page] Error on getPostingInfoFromNotionPage`, {
      error: error.message,
      parameters: {
        pageBlocks: JSON.stringify(pageBlocks),
      },
    });
    return { data: null, error };
  }
};

app.use(express.json());
app.post("/", router);

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`[notion-page]: listening on port ${port}`);
});
