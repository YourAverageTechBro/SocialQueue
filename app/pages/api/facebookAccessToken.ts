import {
  createServerSupabaseClient,
  SupabaseClient,
} from "@supabase/auth-helpers-nextjs";
import { withAxiom, AxiomAPIRequest } from "next-axiom";
import type { NextApiResponse } from "next";
import fetch from "node-fetch";
import { InstagramAccount } from "../../utils/facebookSdk";

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  try {
    const supabaseServerClient = createServerSupabaseClient({
      req,
      res,
    });
    if (req.method === "POST") {
      console.log("[api/facebookAccessToken] Starting POST endpoint", {
        body: JSON.stringify(req.body),
      });
      const body = JSON.parse(req.body);
      const {
        shortLivedAccessToken,
        appScopedUserId,
        instagramBusinessAccountId,
        userId,
      } = body;
      await fetchPermanentPageAccessToken(
        appScopedUserId,
        shortLivedAccessToken,
        supabaseServerClient,
        instagramBusinessAccountId,
        userId,
        req
      );
      console.log("[api/facebookAccessToken] Completed POST endpoint");
      res.status(200).json({});
    }
  } catch (error: any) {
    console.error(`[api/facebookAccessToken] Error: ${error.message}`);
    res.status(500).json({
      error: "Sorry, we failed authenticating with Facebook. Please try again.",
    });
  }
}

const fetchPermanentPageAccessToken = async (
  appScopedUserId: string,
  shortLivedAccessToken: string,
  supabaseServerClient: SupabaseClient,
  instagramBusinessAccountId: string,
  userId: string,
  req: AxiomAPIRequest
) => {
  console.log(
    "[api/facebookAccessToken] Starting fetchPermanentPageAccessToken",
    {
      parameters: {
        appScopedUserId,
        shortLivedAccessToken,
        instagramBusinessAccountId,
        userId,
      },
    }
  );
  try {
    console.log(
      "[api/facebookAccessToken] Attempting to fetch long lived user token",
      {
        parameters: {
          shortLivedAccessToken,
        },
      }
    );
    const longLivedUserTokenResponse = await fetch(
      `https://graph.facebook.com/v15.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedAccessToken}`,
      {
        method: "GET",
      }
    );
    const json = (await longLivedUserTokenResponse.json()) as any;
    console.log("[api/facebookAccessToken] Fetched long lived user token", {
      parameters: {
        longLivedUserTokenResponseJson: JSON.stringify(json),
      },
    });
    if (json.error) {
      throw Error("Failed fetching permanent page access token: ", json.error);
    }
    const { access_token: longLivedUserToken } = json;

    console.log(
      "[api/facebookAccessToken] Attempting to fetch permanent page access token",
      {
        parameters: {
          appScopedUserId,
          longLivedUserToken,
        },
      }
    );
    const permanentPageAccessTokenResponse = await fetch(
      `https://graph.facebook.com/v15.0/${appScopedUserId}/accounts?access_token=${longLivedUserToken}`,
      {
        method: "GET",
      }
    );
    const pageAccessTokenJson =
      (await permanentPageAccessTokenResponse.json()) as any;
    console.log(
      "[api/facebookAccessToken] Fetched permanent page access token",
      {
        parameters: {
          pageAccessTokenJson: JSON.stringify(pageAccessTokenJson),
        },
      }
    );

    if (pageAccessTokenJson.error) {
      throw Error(
        "Failed fetching permanent page access token: ",
        pageAccessTokenJson.error
      );
    }
    const instagramAccount = pageAccessTokenJson.data.find(
      (account: InstagramAccount) => account.access_token
    );
    if (!instagramAccount) return;
    await savePermanentPageAccessToken(
      instagramAccount.access_token,
      supabaseServerClient,
      instagramBusinessAccountId,
      instagramAccount.name,
      userId,
      req
    );
    console.log(
      "[api/facebookAccessToken] Completed fetchPermanentPageAccessToken",
      {
        parameters: {
          appScopedUserId,
          shortLivedAccessToken,
          instagramBusinessAccountId,
          userId,
        },
      }
    );
  } catch (error: any) {
    console.error(
      "[api/facebookAccessToken] Error on fetchPermanentPageAccessToken:",
      {
        message: error.message,
        appScopedUserId,
        shortLivedAccessToken,
        instagramBusinessAccountId,
        userId,
      }
    );
  }
};

const savePermanentPageAccessToken = async (
  permanentPageAccessToken: string,
  supabaseServerClient: SupabaseClient,
  instagramBusinessAccountId: string,
  username: string,
  userId: string,
  req: AxiomAPIRequest
) => {
  try {
    console.log(
      "[api/facebookAccessToken] Starting savePermanentPageAccessToken",
      {
        parameters: {
          permanentPageAccessToken,
          instagramBusinessAccountId,
          username,
          userId,
        },
      }
    );
    const { error } = await supabaseServerClient.from("SocialAccounts").insert({
      social_id: instagramBusinessAccountId,
      social_platform: "instagram",
      access_token: permanentPageAccessToken,
      user_id: userId,
      username,
    });
    if (error) throw error;
    console.log(
      "[api/facebookAccessToken] Completed savePermanentPageAccessToken",
      {
        parameters: {
          permanentPageAccessToken,
          instagramBusinessAccountId,
          username,
          userId,
        },
      }
    );
  } catch (error: any) {
    console.error(
      "[api/facebookAccessToken] Error on savePermanentPageAccessToken ",
      {
        message: error.message,
        parameters: {
          permanentPageAccessToken,
          instagramBusinessAccountId,
          username,
          userId,
        },
      }
    );
    throw error;
  }
};

export default withAxiom(handler);
