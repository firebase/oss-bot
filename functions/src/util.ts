import { format } from "date-fns";
import * as log from "./log";

export const FUNCTION_OPTS = {
  timeoutSeconds: 540,
  memory: "2GB" as "2GB"
};

export async function delay(seconds: number) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export function DateSlug(date: Date): string {
  return format(date, "YY-MM-DD");
}

const timers: { [s: string]: number } = {};

function getTime(): number {
  return new Date().getTime();
}

export function startTimer(label: string) {
  timers[label] = getTime();
}

export function endTimer(label: string) {
  const start = timers[label];
  if (!start) {
    return;
  }

  const end = getTime();
  const diff = end - start;

  log.logData({
    event: "timer",
    label: label,
    val: diff,
    message: `Operation "${label}" took ${diff}ms`
  });

  delete timers[label];
}
