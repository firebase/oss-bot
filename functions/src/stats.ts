import { Library } from "./library";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// TODO: The client should insert the ID directly into the RTDB
//       and then this should run as a DB triggered function.
export const AddStatsProject = functions.https.onRequest(async (req, res) => {
  // TODO: Create project inline
  const projectId = req.param("project");

  try {
    for (let i = 1; i <= 7; i++) {
      await Library.storeDailyMetrics(projectId, admin.database(), i);
    }
    res.status(200).send(`${projectId} --> done`);
  } catch (e) {
    res.status(500).send(`Failed to store ${projectId}: ${e}`);
  }
});

// TODO: Make this part of the daily snapshot thing
export const StoreDailyStats = functions.https.onRequest(async (req, res) => {
  const projectId = req.param("project");

  try {
    const stats = await Library.storeDailyMetrics(projectId, admin.database());
    res.status(200).send(`${projectId} --> ${JSON.stringify(stats)}`);
  } catch (e) {
    res.status(500).send(`Failed to store ${projectId}: ${e}`);
  }
});
