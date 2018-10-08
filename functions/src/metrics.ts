import { Bintray, Npm } from "./downloads";
import { GetRepoSAM } from "./report";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as moment from "moment";

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

  console.log(`Getting SAM for ${repo} on ${dayKey}.`);
  const repoRef = admin
    .database()
    .ref()
    .child(`snapshots/github/${dayKey}/repos/${repo}`);

  const repoSnap = await repoRef.once("value");
  if (!(repoSnap && repoSnap.val())) {
    console.warn(`No snapshot for ${repo} on ${dayKey}`);
    return 0;
  }
  return GetRepoSAM(repoSnap.val());
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

  // Get the number of downloads from the appropriate source
  let numDownloads;
  if (projectData.source === "bintray") {
    numDownloads = await Bintray.getDownloadsOnDay(
      projectData.owner,
      projectData.pkg,
      m.year(),
      m.month(),
      m.date()
    );
  } else if (projectData.source === "npm") {
    numDownloads = await Npm.getDownloadsOnDay(
      projectData.pkg,
      m.year(),
      m.month(),
      m.date()
    );
  } else {
    throw `Source not supported: ${projectData.source}`;
  }

  // Get the dated SAM score
  const samScore = await this.getDatedSAM(
    projectData.repo,
    m.year(),
    m.month(),
    m.date()
  );

  // TODO: Better key
  const dateKey = `${m.format("YYYY-MM-DD")}`;

  const dataRef = admin
    .database()
    .ref()
    .child("metrics-data")
    .child(projectId);

  await dataRef
    .child("downloads")
    .child(dateKey)
    .set(numDownloads);

  await dataRef
    .child("sam")
    .child(dateKey)
    .set(samScore);

  return {
    downloads: numDownloads,
    sam: samScore
  };
}

// TODO: The client should insert the ID directly into the RTDB
//       and then this should run as a DB triggered function.
export const BackfillMetrics = functions.https.onRequest(async (req, res) => {
  // TODO: Create project inline
  const projectId = req.param("project");

  try {
    for (let i = 1; i <= 7; i++) {
      await storeDailyMetrics(projectId, admin.database(), i);
    }
    res.status(200).send(`${projectId} --> done`);
  } catch (e) {
    res.status(500).send(`Failed to store ${projectId}: ${e}`);
  }
});

export const UpdateMetricsWebhook = functions.https.onRequest(
  async (req, res) => {
    const projectId = req.param("project");
    try {
      await storeDailyMetrics(projectId, admin.database());
      res.status(200).send("Done.");
    } catch (e) {
      res.status(500).send("Failed: " + e);
    }
  }
);

export const UpdateMetrics = functions.pubsub
  .topic("update-metrics")
  .onPublish(async (message, context) => {
    const projectId = message.json["project"];
    await storeDailyMetrics(projectId, admin.database());
  });

// TODO: Implement
export const UpdateAllMetrics = functions.https.onRequest(async (req, res) => {
  const db = admin.database();
  const snap = await db.ref("metrics").once("value");
  const val = snap.val();

  Object.keys(val).forEach(async (projectId: string) => {
    console.log(`Updating metrics for: ${projectId}`);
    // TODO: Send a pubsub for eachone
  });
});
