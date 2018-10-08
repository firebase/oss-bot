import { Bintray, Npm } from "./downloads";
import { GetRepoSAM } from "./report";
import * as admin from "firebase-admin";
import * as moment from "moment";

export class Library {
  // TODO: Should probably move this out
  static async getDatedSAM(
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

  static async storeDailyMetrics(
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
    const projectRef = admin
      .database()
      .ref("metrics")
      .child(projectId);

    await projectRef
      .child("downloads")
      .child(dateKey)
      .set(numDownloads);

    await projectRef
      .child("sam")
      .child(dateKey)
      .set(samScore);

    return {
      downloads: numDownloads,
      sam: samScore
    };
  }
}
