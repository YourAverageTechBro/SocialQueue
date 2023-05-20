// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { encode } from "https://deno.land/std/encoding/base64.ts";
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";

console.log(`Function "get-notion-access-token" is up and running`);
const NOTION_CLIENT_ID = Deno.env.get("NOTION_OAUTH_CLIENT_ID");
const NOTION_CLIENT_SECRET = Deno.env.get("NOTION_OAUTH_CLIENT_SECRET");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    console.log(
      "[get-notion-access-token] Attempting to get notion access token"
    );
    const { email, code, user_id } = await req.json();
    console.log("[get-notion-access-token] parameters: ", {
      email,
      code,
      user_id,
    });
    const resp = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${encode(
          `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
        )}`,
        "Content-Type": "application/json ",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: "http://localhost:3000/setup/socials",
      }),
    });
    const json = await resp.json();
    if (json.error) {
      throw Error(
        `[get-notion-access-token] error in request to notion. error: ${json.error} error_description: ${json.error_description}`
      );
    }
    console.log("[get-notion-access-token] notion response: ", json);
    const {
      access_token,
      bot_id,
      workspace_name,
      workspace_icon,
      workspace_id,
      owner,
      duplicated_template_id,
    } = json;
    const { error } = await supabaseClient.from("Users").insert({
      notion_access_token: access_token,
      notion_bot_id: bot_id,
      notion_workspace_name: workspace_name,
      notion_workspace_icon: workspace_icon,
      notion_workspace_id: workspace_id,
      notion_owner: owner,
      notion_duplicated_template_id: duplicated_template_id,
      email,
      id: user_id,
    });
    if (error) throw error;

    console.log(
      "[get-notion-access-token] successfully fetched and stored notion info ",
      { ...json, email, code, user_id }
    );
    return new Response(JSON.stringify({ status: "success", access_token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.log("[get-notion-access-token] failed", error);
    return new Response(JSON.stringify({ error }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// To invoke:
// curl -i --location --request POST 'http://localhost:54321/functions/v1/' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.625_WdcF3KHqz5amU0x2X5WWHP-OEs_4qj0ssLNHzTs' \
//   --header 'Content-Type: application/json' \
//   --data '{"code":"0325568d-e47e-440b-ae06-a78f83c39719"}'
