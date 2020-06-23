import { Bintray, Npm, Cocoapods } from "./downloads";
import { ComputeSAMScore } from "./report";
import * as log from "./log";
import * as util from "./util";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as moment from "moment";
import { sendPubSub } from "./pubsub";

// TODO: Should probably move this out
async function getDatedSAM(
  repo: string,
  year: number,
  month: number,
  date: number
) {
  // snapshots/github/YY-MM-DD/repos/REPO
  const day = moment.utc([year, month, date]);
  const dayKey = day.format("YY-MM-DD");

  log.debug(`Getting SAM for ${repo} on ${dayKey}.`);
  const repoRef = admin
    .database()
    .ref()
    .child(`snapshots/github/${dayKey}/repos/${repo}`);

  const repoSnap = await repoRef.once("value");
  if (!(repoSnap && repoSnap.val())) {
    log.warn(`No snapshot for ${repo} on ${dayKey}`);
    return 0;
  }
  return ComputeSAMScore(repoSnap.val());
}

async function storeDailyMetrics(
  projectId: string,
  db: admin.database.Database,
  daysAgo: number = 1
) {
  // Default daysAgo is 1 (yesterday)
  if (daysAgo < 1) {
    throw "Can't get stats newer than yesterday!";
  }
  const m = moment().subtract(daysAgo, "day");

  // Get the project from the database
  const projectSnap = await db
    .ref("metrics")
    .child(projectId)
    .once("value");
  const projectData = projectSnap.val();

  // Gather stats about the project
  const stats: any = {};

  // Stats from the appropriate source
  if (projectData.source === "bintray") {
    stats["downloads"] = await Bintray.getDownloadsOnDay(
      projectData.pkg,
      m.year(),
      m.month(),
      m.date()
    );
  } else if (projectData.source === "npm") {
    stats["downloads"] = await Npm.getDownloadsOnDay(
      projectData.pkg,
      m.year(),
      m.month(),
      m.date()
    );
  } else if (projectData.source == "cocoapods") {
    // Note cocoapods only offers total download stats.
    const res = await Cocoapods.getStats(projectData.pkg);
    stats["downloads"] = res.downloads;
    stats["apps"] = res.apps;
  } else {
    throw `Source not supported: ${projectData.source}`;
  }

  // Get the dated SAM score
  stats["sam"] = await getDatedSAM(
    projectData.repo,
    m.year(),
    m.month(),
    m.date()
  );

  const dateKey = `${m.format("YYYY-MM-DD")}`;

  const dataRef = admin
    .database()
    .ref()
    .child("metrics-data")
    .child(projectId);

  Object.keys(stats).forEach(async (key: string) => {
    const val = stats[key];
    await dataRef
      .child(key)
      .child(dateKey)
      .set(val);
  });

  log.debug(`${projectId} stats on ${dateKey}: ${JSON.stringify(stats)}`);
  return stats;
}

// TODO: The client should insert the ID directly into the RTDB
//       and then this should run as a DB triggered function.
export const BackfillMetrics = functions
  .runWith(util.FUNCTION_OPTS)
  .https.onRequest(async (req, res) => {
    // TODO: Create project inline
    const projectId = req.param("project");

    try {
      for (let i = 1; i <= 30; i++) {
        await storeDailyMetrics(projectId, admin.database(), i);
      }
      res.status(200).send(`${projectId} --> done`);
    } catch (e) {
      res.status(500).send(`Failed to store ${projectId}: ${e}`);
    }
  });

export const UpdateMetricsWebhook = functions
  .runWith(util.FUNCTION_OPTS)
  .https.onRequest(async (req, res) => {
    const projectId = req.param("project");
    try {
      await storeDailyMetrics(projectId, admin.database());
      res.status(200).send("Done.");
    } catch (e) {
      res.status(500).send("Failed: " + e);
    }
  });

export const UpdateMetrics = functions
  .runWith(util.FUNCTION_OPTS)
  .pubsub.topic("update-metrics")
  .onPublish(async (message, context) => {
    const projectId = message.json["project"];
    await storeDailyMetrics(projectId, admin.database());
  });

export const UpdateAllMetrics = functions
  .runWith(util.FUNCTION_OPTS)
  .pubsub.schedule("every day 13:00")
  .onRun(async () => {
    const db = admin.database();
    const snap = await db.ref("metrics").once("value");
    const val = snap.val();

    Object.keys(val).forEach(async (projectId: string) => {
      log.debug(`Updating metrics for: ${projectId}`);
      await sendPubSub("update-metrics", { project: projectId });
    });
  });
