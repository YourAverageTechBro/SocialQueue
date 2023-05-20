// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { Client } from "https://deno.land/x/notion_sdk/src/mod.ts";
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";

console.log(`Function "queue-posts" has started`);

type NotionMultiSelectType = {
  id: string;
  name: string;
  color: string;
};

serve(async (_req) => {
  try {
    console.log(`[queue-posts] starting function`);
    const { data, error } = await supabaseClient.from("Users").select(
      `notion_access_token, 
    notion_duplicated_template_id,
    SocialAccounts (
      social_id,
      access_token,
      username,
      social_platform
    )
    `
    );
    if (error) throw error;
    console.log(
      "[queue-posts] successfully fetched data from supabase: ",
      data
    );
    data.map(async (entry) => {
      const notionAccessToken = entry["notion_access_token"];
      const notionDuplicatedTemplateId = entry["notion_duplicated_template_id"];
      const notion = new Client({
        auth: notionAccessToken,
      });

      let socialAccountMap: Record<string, any> = {};
      if (Array.isArray(entry["SocialAccounts"])) {
        entry["SocialAccounts"].forEach((account: any) => {
          const username = account["username"] as string;
          const platform = account["social_platform"] as string;
          const key = `${username}-${platform}`;
          socialAccountMap[key] = {
            social_id: account["social_id"],
            access_token: account["access_token"],
          };
        });
      } else if (entry["SocialAccounts"]) {
        const account = entry["SocialAccounts"];
        const username = account["username"] as string;
        const platform = account["social_platform"] as string;
        const key = `${username}-${platform}`;
        socialAccountMap[key] = {
          social_id: account["social_id"],
          access_token: account["access_token"],
        };
      }
      console.log("[queue-posts] created socialAccountMap: ", socialAccountMap);

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
          ],
        },
      })) as any;
      console.log("[queue-posts] fetched queued posts: ", pages);
      pages.results.forEach(async (page: any) => {
        const pageId = page.id;
        const accountsToPostTo =
          page.properties["Social media account"].multi_select;
        const publicationDate = page.properties["Publication date"].date;
        accountsToPostTo.map(async (account: NotionMultiSelectType) => {
          const { social_id: instagramAccountId, access_token: accessToken } =
            socialAccountMap[account.name];

          const timeToPostDate = new Date(publicationDate.start);
          writePostToDatabase(
            instagramAccountId,
            accessToken,
            timeToPostDate.toISOString(),
            pageId
          );
        });
      });
    });
    return new Response(JSON.stringify({ status: "success" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log("[queue-posts]: failed", error);
    return new Response(JSON.stringify({ status: "error" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});

const writePostToDatabase = async (
  instagramAccountId: string,
  accessToken: string,
  timeToPost: string,
  notionPageId: string
) => {
  try {
    // TODO: Add support for photos + carousels
    const { error } = await supabaseClient.from("InstagramPosts").insert({
      instagram_account_id: instagramAccountId,
      access_token: accessToken,
      time_to_post: timeToPost,
      notion_page_id: notionPageId,
      status: "scheduled",
      media_type: "REELS",
    });
    if (error) throw error;
  } catch (error) {
    console.log(
      "[queuePosts][writePostToDatabase]: Failed writing post to database",
      error
    );
  }
};
// To invoke:
// curl -i --location --request POST 'http://localhost:54321/functions/v1/' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.625_WdcF3KHqz5amU0x2X5WWHP-OEs_4qj0ssLNHzTs' \
//   --header 'Content-Type: application/json' \
//   --data '{"name":"Functions"}'
