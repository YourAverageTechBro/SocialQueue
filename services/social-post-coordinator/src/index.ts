import { PubSub } from "@google-cloud/pubsub";
import express, { Request, RequestHandler, Response } from "express";

type NotionMultiSelectType = {
  id: string;
  name: string;
  color: string;
};

const app = express();

const router: RequestHandler = async (req: Request, res: Response) => {
  console.log("[social-post-coordinator] Starting social-post-coordinator");
  try {
    if (!req.body) {
      const msg = "no Pub/Sub message received";
      console.error(`error: ${msg}`);
      res.status(204).send(`[social-post-coordinator] Bad Request: ${msg}`);
      return;
    }
    if (!req.body.message) {
      const msg = "invalid Pub/Sub message format";
      console.error(`error: ${msg}`);
      res.status(204).send(`[social-post-coordinator] Bad Request: ${msg}`);
      return;
    }

    const pubSubMessage = JSON.parse(
      Buffer.from(req.body.message.data, "base64").toString()
    );
    console.log("[social-post-coordinator] Parsed data: ", pubSubMessage);
    const socialPlatform = pubSubMessage.platform;
    const pubSubClient = new PubSub();
    if (!socialPlatform) throw Error("No social platform found");
    if (socialPlatform === "instagram") {
      const topicName = "projects/socialqueue-374118/topics/instagram-post";
      const dataBuffer = Buffer.from(JSON.stringify(pubSubMessage));
      const messageId = await pubSubClient
        .topic(topicName)
        .publishMessage({ data: dataBuffer });
      console.log(`[social-post-coordinator] Message ${messageId} published.`);
    } else {
      throw Error(`Error processing post: ${{ pubSubMessage }}`);
    }
    res.status(204).send();
  } catch (error) {
    console.error("[social-post-coordinator][error]: ", JSON.stringify(error));
    res.status(204).send(`Bad Request: ${error}`);
  }
};

app.use(express.json());
app.post("/", router);

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, () => {
  console.log(`[social-post-coordinator]: listening on port ${port}`);
});
