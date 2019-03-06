import fetch from "node-fetch";
import * as moment from "moment";

import * as log from "./log";

/**
 * GET request with a URL and some URL params.
 */
function getJSON(baseUrl: string, params: any): Promise<any> {
  const paramStr = Object.keys(params)
    .map(key => {
      return `${key}=${params[key]}`;
    })
    .join("&");

  const url = `${baseUrl}?${paramStr}`;

  return fetch(url, { method: "GET" }).then((res: any) => {
    return res.json();
  });
}

export class Npm {
  /**
   * Get the downloads for a package on a single day.
   */
  static async getDownloadsOnDay(
    pkg: string,
    year: number,
    month: number,
    date: number
  ) {
    // Notes:
    //  - Months are 0-indexed but years and dates are 1-indexed
    const day = moment.utc([year, month, date]);
    const dayKey = day.format("YYYY-MM-DD");
    const url = `https://api.npmjs.org/downloads/point/${dayKey}/${pkg}`;

    log.debug(`[npm] Fetching downloads for ${dayKey}.`);
    return getJSON(url, {}).then((result: any) => {
      return result.downloads;
    });
  }
}

export class Bintray {
  /**
   * Get the downloads for a package on a single day.
   */
  static async getDownloadsOnDay(
    pkg: string,
    year: number,
    month: number,
    date: number
  ) {
    // Notes:
    //  - Months are 0-indexed but years and dates are 1-indexed
    //  - The API seems to return no results for less than a two-day range
    const day = moment.utc([year, month, date]);
    const before = day.clone().subtract(2, "day");

    return this.getDownloadsInRange(
      pkg,
      before.toISOString(),
      day.toISOString()
    ).then((result: any) => {
      const key = `${day.valueOf()}`;
      return result[key];
    });
  }

  /**
   * Get the downloads for a package.
   *
   * Return looks like:
   * {
   *  timestamp: downloadCount
   * }
   *
   * timestamp is a string of millis since the epoch.
   */
  static async getDownloadsInRange(pkg: string, start: string, end: string) {
    const baseUrl = "https://bintray.com/statistics/packageStatistics";
    const params = {
      startDate: start,
      endDate: end,
      pkgPath: pkg
    };

    const resJson = await getJSON(baseUrl, params);
    const totals: any = {};

    log.debug(
      `[bintray] Fetching downloads for ${pkg} from ${start} to ${end}`
    );

    // Response has 'data' which is an array of objects that each have:
    //  version - string version number of the library.
    //  series - an array of two-element arrays, each with a timestamp and a count.
    resJson.data.forEach((version: any) => {
      version.series.forEach((day: any[]) => {
        const dayStamp = day[0];
        const dayCount = day[1];

        if (!totals[dayStamp]) {
          totals[dayStamp] = 0;
        }

        totals[dayStamp] += dayCount;
      });
    });

    return totals;
  }
}

export class Cocoapods {
  static async getStats(pod: string) {
    const url = `http://metrics.cocoapods.org/api/v1/pods/${pod}.json`;
    const resJSON = await getJSON(url, {});

    const totalDownloads = resJSON.stats.download_total;
    const totalApps = resJSON.stats.app_total;

    return {
      downloads: totalDownloads,
      apps: totalApps
    };
  }
}
