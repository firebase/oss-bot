import { PubSub } from "@google-cloud/pubsub";
import * as log from "./log";

// Just #pubsubthings
const pubsubClient = new PubSub({
  projectId: process.env.GCLOUD_PROJECT
});

export function sendPubSub(topic: string, data: any): Promise<any> {
  const publisher = pubsubClient.topic(topic).publisher;

  log.debug(`PubSub(${topic}, ${JSON.stringify(data)}`);
  return publisher.publish(Buffer.from(JSON.stringify(data)));
}
