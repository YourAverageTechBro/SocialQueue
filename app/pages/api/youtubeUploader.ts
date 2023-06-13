import { AxiomAPIRequest, Logger, withAxiom } from "next-axiom";
import { NextApiResponse } from "next";
import { google } from "googleapis";
import { rateLimit, supabaseClient } from "../../utils/utils";
import { SocialMediaPlatform } from "../../types/supabaseTypes";
import { Client } from "@notionhq/client";

const oauth2Client = new google.auth.OAuth2(
  process.env.NEXT_PUBLIC_YOUTUBE_OAUTH_CLIENT_KEY,
  process.env.NEXT_PUBLIC_YOUTUBE_OAUTH_SECRET_KEY,
  "postmessage"
);

const youtube = google.youtube("v3");

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    req.log.info(`[api/youtubeUploader] Starting youtubeUploader endpoint`, {
      body: JSON.stringify(req.body),
      query: JSON.stringify(req.query),
    });
    const { accessToken, userId, notionAccessToken, notionDatabaseId } =
      req.query as {
        accessToken: string;
        userId: string;
        notionAccessToken: string;
        notionDatabaseId: string;
      };
    let { tokens } = await oauth2Client.getToken(accessToken);
    console.log("[api/youtubeUploader] Got tokens", {
      tokens: JSON.stringify(tokens),
    });
    oauth2Client.setCredentials(tokens);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      req.log.error("[api/youtubeUploader] No refresh token found");
      res.status(204).end();
      return;
    }
    const refreshAccessTokenResponse = await oauth2Client.refreshAccessToken();
    if (refreshAccessTokenResponse.res?.status !== 200) {
      req.log.error("[api/youtubeUploader] Error refreshing token", {
        error: refreshAccessTokenResponse.res?.statusText,
      });
      res.status(204).end();
      return;
    }

    const { access_token, refresh_token } =
      refreshAccessTokenResponse.credentials;
    const channels = await youtube.channels.list({
      mine: true,
      auth: oauth2Client,
      part: ["snippet", "contentDetails", "statistics"],
    });

    req.log.info("HEY CHANNELS: ", { channels: JSON.stringify(channels) });
    const channel = channels.data.items?.[0];
    if (!channel) {
      req.log.error("[api/youtubeUploader] No channel found ", {
        channels: JSON.stringify(channels),
      });
      res.status(204).end();
      return;
    }
    const channelTitle = channel.snippet?.title;
    if (!channelTitle) {
      req.log.error("[api/youtubeUploader] No channel title found");
      return;
    }

    supabaseClient.from("SocialAccounts").insert({
      social_id: channel.id,
      social_platform: SocialMediaPlatform.YOUTUBE,
      access_token: access_token,
      user_id: userId,
      youtube_refresh_token: refresh_token,
      username: channelTitle,
    });

    await createSampleSocialPostForAccount(
      channelTitle,
      notionAccessToken,
      notionDatabaseId,
      req.log
    );

    req.log.info(`[api/youtubeUploader] Completed youtubeUploader endpoint`, {
      body: JSON.stringify(req.body),
      query: JSON.stringify(req.query),
    });

    res.status(200).end();
  } catch (error: unknown) {
    res.status(500).json({
      error: error instanceof Error ? error.message : JSON.stringify(error),
    });
  }
}

const createSampleSocialPostForAccount = async (
  username: string,
  notionAccessToken: string,
  notionDatabaseId: string,
  log: Logger
) => {
  log.info(
    "[api/youtubeUploader][createSampleSocialPostForAccount] Starting function: ",
    { username, notionAccessToken, notionDatabaseId }
  );
  if (notionAccessToken && notionDatabaseId) {
    log.info(
      "[api/youtubeUploader][createSampleSocialPostForAccount] Creating notion client"
    );
    const notion = new Client({
      auth: notionAccessToken,
    });
    log.info(
      "[api/youtubeUploader][createSampleSocialPostForAccount] Creating notion page"
    );
    const { success } = await rateLimit.notionApi.limit("api");

    if (!success) return;

    const platform = SocialMediaPlatform.YOUTUBE;

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
        Status: {
          select: {
            name: "Ready",
          },
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
                  content: "Upload the video that you want to post here.",
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
      "[api/youtubeUploader][createSampleSocialPostForAccount] Successfully created sample notion page: ",
      response
    );
  }
};

export default withAxiom(handler);
