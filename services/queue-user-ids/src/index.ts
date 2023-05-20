import express, { Request, RequestHandler, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { PubSub } from "@google-cloud/pubsub";

const app = express();

const router: RequestHandler = async (req: Request, res: Response) => {
  try {
    console.log(`[queue-user-ids] Starting queueUserIds`);

    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default when deployed.
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_SECRET ?? ""
    );
    const { data, error } = await supabaseClient.from("Users").select("id");
    console.log(
      `[queue-user-ids] Successfully fetched data from Supabase: ${JSON.stringify(
        data
      )}`
    );
    if (error) throw error;

    const fiveMinutesBeforeCurrentDate = new Date(
      Date.now() - 1000 * (60 * 5)
    ).toISOString();
    const pubSubClient = new PubSub();
    const topicName = "projects/socialqueue-374118/topics/user-ids";
    await Promise.all(
      data.map(async (entry) => {
        const id = entry.id;
        if (!id) throw Error("User id not found");

        const dataBuffer = Buffer.from(
          JSON.stringify({
            userId: id,
            timestamp: fiveMinutesBeforeCurrentDate,
          })
        );
        const messageId = await pubSubClient
          .topic(topicName)
          .publishMessage({ data: dataBuffer });
        console.log(
          `[queue-user-ids] message ${messageId} published with data ${JSON.stringify(
            {
              userId: id,
              timestamp: fiveMinutesBeforeCurrentDate,
            }
          )}`
        );
      })
    );
    console.log(`[queue-user-ids] Completed queueUseIds`);
    res.status(204).send();
  } catch (error: any) {
    console.error(`[queue-user-ids] Error ${error.message}`);
    res.status(500).json({ data: "BAD" });
  }
};

app.use("/", router);

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`[queue-user-ids]: listening on port ${port}`);
});
