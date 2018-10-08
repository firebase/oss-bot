import fetch from "node-fetch";
import * as moment from "moment";

export class Bintray {
  /**
   * GET request with a URL and some URL params.
   */
  static getJSON(baseUrl: string, params: any): Promise<any> {
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

  /**
   * Get the downloads for a package on a single day.
   */
  static async getDownloadsOnDay(
    owner: string,
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
      owner,
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
  static async getDownloadsInRange(
    owner: string,
    pkg: string,
    start: string,
    end: string
  ) {
    const baseUrl = "https://bintray.com/statistics/packageStatistics";
    const params = {
      startDate: start,
      endDate: end,
      pkgPath: `${owner}/${pkg}`
    };

    const resJson = await this.getJSON(baseUrl, params);
    const totals: any = {};

    console.log(`Fetching downloads for ${pkg} from ${start} to ${end}`);

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
