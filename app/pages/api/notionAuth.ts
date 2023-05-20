import {
  createServerSupabaseClient,
  SupabaseClient,
} from "@supabase/auth-helpers-nextjs";
import { withAxiom, AxiomAPIRequest } from "next-axiom";
import type { NextApiResponse } from "next";
import fetch from "node-fetch";

const NOTION_CLIENT_ID = process.env.NEXT_PUBLIC_NOTION_OAUTH_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NEXT_PUBLIC_NOTION_OAUTH_CLIENT_SECRET;

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  const supabaseServerClient = createServerSupabaseClient({
    req,
    res,
  });
  try {
    if (req.method === "POST") {
      console.log("[api/notionAuth] Starting POST endpoint", {
        body: JSON.stringify(req.body),
      });
      const body = JSON.parse(req.body);
      const { email, code, user_id } = body;
      const userAlreadyExists = await checkIfUserAlreadyAuthenticatedWithNotion(
        supabaseServerClient,
        user_id
      );
      if (!userAlreadyExists) {
        await authenticateWithNotion(
          supabaseServerClient,
          code,
          email,
          user_id,
          req
        );
      }
      console.log("[api/notionAuth] Completed POST endpoint", {
        body: JSON.stringify(req.body),
      });
      res.status(200).json({
        error: null,
      });
    }
  } catch (error: any) {
    console.error("[api/notionAuth]: Error", error);
    res.status(500).json({ error });
  }
}

const checkIfUserAlreadyAuthenticatedWithNotion = async (
  supabaseServerClient: SupabaseClient,
  userId: string
) => {
  const { data, error } = await supabaseServerClient
    .from("Users")
    .select()
    .eq("id", userId);
  if (error) throw error;
  return data[0].notion_access_token !== null;
};

const authenticateWithNotion = async (
  supabaseServerClient: SupabaseClient,
  code: string,
  email: string,
  userId: string,
  req: AxiomAPIRequest
) => {
  try {
    console.log(
      "[api/notionAuth][authenticateWithNotion] attempt to authenticate with Notion"
    );
    console.log(
      `[api/notionAuth][authenticateWithNotion] With Auth Token:  ${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
    );
    console.log(
      `[api/notionAuth][authenticateWithNotion] With Redirect URI:  ${process.env.NEXT_PUBLIC_NOTION_REDIRECT_BASE_URL}/dashboard/profile`
    );
    const resp = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "post",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
        ).toString("base64")}`,
        "Content-Type": "application/json ",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: `${process.env.NEXT_PUBLIC_NOTION_REDIRECT_BASE_URL}/dashboard/profile`,
      }),
    });
    console.log(
      "[api/notionAuth][authenticateWithNotion]: Successfully authenticated with notion"
    );
    const json = (await resp.json()) as any;
    console.log(
      "[api/notionAuth][authenticateWithNotion]: Notion fetch response",
      json
    );
    if (json.error) {
      throw Error(
        `error in request to notion. error: ${json.error} error_description: ${json.error_description}`
      );
    }
    const {
      access_token,
      bot_id,
      workspace_name,
      workspace_icon,
      workspace_id,
      owner,
      duplicated_template_id,
    } = json;
    console.log(
      "[api/notionAuth][authenticateWithNotion] notion response: ",
      json
    );
    await createUser(
      supabaseServerClient,
      access_token,
      bot_id,
      workspace_name,
      workspace_icon,
      workspace_id,
      owner,
      duplicated_template_id,
      email,
      userId,
      req
    );
    return {
      accessToken: access_token,
      duplicatedTemplateId: duplicated_template_id,
    };
  } catch (error: any) {
    console.error("[api/notionAuth][authenticateWithNotion]: ", error);
  }
};

const createUser = async (
  supabaseServerClient: SupabaseClient,
  access_token: string,
  bot_id: string,
  workspace_name: string,
  workspace_icon: string,
  workspace_id: string,
  owner: Record<any, any>,
  duplicated_template_id: string,
  email: string,
  userId: string,
  req: AxiomAPIRequest
) => {
  try {
    console.log(
      "[api/notionAuth][createUser] Attempting to write data into Supabase"
    );
    const { error } = await supabaseServerClient
      .from("Users")
      .update({
        notion_access_token: access_token,
        notion_bot_id: bot_id,
        notion_workspace_name: workspace_name,
        notion_workspace_icon: workspace_icon,
        notion_workspace_id: workspace_id,
        notion_owner: owner,
        notion_duplicated_template_id: duplicated_template_id,
        email,
      })
      .eq("id", userId);
    if (error) throw error;
    console.log(
      "[api/notionAuth][createUser] Successfully wrote data into Supabase"
    );
  } catch (error: any) {
    console.error("[api/notionAuth][createUser] Failed creating user: ", error);
  }
};

export default withAxiom(handler);
