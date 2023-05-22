import { Client } from "@notionhq/client";
import type { NextApiResponse } from "next";
import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { rateLimit } from "../../utils/utils";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(
      "[api/sampleNotionSocialPost] Starting to create social post for account"
    );
    const body = JSON.parse(req.body);
    const { notionAccessToken, notionDatabaseId, username, platform, color } =
      body;
    req.log.info("[api/sampleNotionSocialPost] Parsed data: ", {
      notionAccessToken,
      notionDatabaseId,
      username,
      platform,
      color,
    });
    await createSampleSocialPostForAccount(
      username,
      platform,
      notionAccessToken,
      notionDatabaseId,
      req.log
    );
    req.log.info(
      "[api/sampleNotionSocialPost] Successfully created the sample social post"
    );
    res.status(200).json({ status: "success" });
  } catch (error: any) {
    console.error(
      "[api/sampleNotionSocialPost] Failed creating the sample social post: ",
      error
    );
    res.status(500).json({ status: "failed" });
  }
}

const createSampleSocialPostForAccount = async (
  username: string,
  platform: string,
  notionAccessToken: string,
  notionDatabaseId: string,
  log: Logger
) => {
  log.info(
    "[api/sampleNotionSocialPost][createSampleSocialPostForAccount] Starting function: ",
    { username, platform, notionAccessToken, notionDatabaseId }
  );
  if (notionAccessToken && notionDatabaseId) {
    log.info(
      "[api/sampleNotionSocialPost][createSampleSocialPostForAccount] Creating notion client"
    );
    const notion = new Client({
      auth: notionAccessToken,
    });
    log.info(
      "[api/sampleNotionSocialPost][createSampleSocialPostForAccount] Creating notion page"
    );

    const { success } = await rateLimit.notionApi.limit("api");

    if (!success) return;

    const response = await notion.pages.create({
      parent: {
        database_id: notionDatabaseId,
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: `Example post for ${username} on ${platform}`,
              },
            },
          ],
        },
        "Social media account": {
          multi_select: [{ name: `${username}-${platform}` }],
        },
      },
      children: [
        {
          object: "block",
          paragraph: {
            rich_text: [
              {
                text: {
                  content:
                    "Any text that is written here will be a part of your caption.",
                },
              },
            ],
          },
        },
        {
          object: "block",
          paragraph: {
            rich_text: [
              {
                text: {
                  content:
                    "Upload the media that you want to post here. Media type of Video requires 1 video, Photo requires 1 photo, Reel supports 1 reel, and Carousel supports up to 10 pieces of media (photo and video mix is allowed).",
                },
              },
            ],
          },
        },
        {
          object: "block",
          paragraph: {
            rich_text: [
              {
                text: {
                  content:
                    "When you're ready to schedule your post, set the status to Ready and set the publication day and time properly.",
                },
              },
            ],
          },
        },
      ],
    });
    log.info(
      "[api/sampleNotionSocialPost][createSampleSocialPostForAccount] Successfully created sample notion page: ",
      response
    );
  }
};

export default withAxiom(handler);
