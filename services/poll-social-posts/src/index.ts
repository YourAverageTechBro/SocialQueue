import express, { Request, RequestHandler, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { PubSub } from "@google-cloud/pubsub";

const app = express();

const router: RequestHandler = async (req: Request, res: Response) => {
  try {
    console.log(`[poll-social-posts] Starting pollSocialPosts`);

    const lowerBoundTime = getLowerBoundTime();
    const upperBoundTime = getUpperBoundTime();
    console.log(
      `[poll-social-posts] Querying data with the following timestamps: ${JSON.stringify(
        {
          lowerBound: lowerBoundTime,
          upperBound: upperBoundTime,
        }
      )}
      `
    );
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default when deployed.
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );
    const { data, error } = await supabaseClient
      .from("InstagramPosts")
      .select("*")
      .lte("time_to_post", upperBoundTime)
      .gte("time_to_post", lowerBoundTime)
      .eq("status", PostStatus.QUEUED);

    if (error) throw error;
    const pubSubClient = new PubSub();
    const topicName = "projects/socialqueue-374118/topics/social-posts";
    await Promise.all(
      data.map(async (post) => {
        const id = post.id.toString();
        if (!id) {
          throw Error("[poll-social-posts] Post id not found");
        }
        const dataBuffer = Buffer.from(
          JSON.stringify({
            post,
            userId: post.user_id,
          })
        );
        const messageId = await pubSubClient
          .topic(topicName)
          .publishMessage({ data: dataBuffer });
        console.log(`[poll-social-posts] post ${messageId} published.`);
      })
    );

    console.log(`[poll-social-posts] Completed pollSocialPosts`);
    res.status(204).send();
  } catch (error: any) {
    console.error("[poll-social-posts] Error: ", error.message);
    res.status(204).send();
  }
};

const getUpperBoundTime = (date = new Date()) => {
  const minutes = 1;
  const ms = 1000 * 60 * minutes;
  return new Date(Math.floor(date.getTime() / ms) * ms).toISOString();
};

const getLowerBoundTime = (date: Date = new Date()) => {
  const minutes = 5;
  return new Date(date.getTime() - minutes * 60000).toISOString();
};

export enum PostStatus {
  QUEUED = "QUEUED",
}

app.use("/", router);

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`[poll-social-posts]: listening on port ${port}`);
});
