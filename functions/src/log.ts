import { Logging } from "@google-cloud/logging";

const LOG_NAME = "custom-log";

// This makes the logs appear in the same place as console.log()
// invocations from Cloud Functions
const METADATA = {
  resource: {
    type: "cloud_function",
    labels: {
      function_name: "CustomMetrics",
      region: "us-central1"
    }
  },
  severity: "DEBUG"
};

// The Logging instance detects the project ID from the environment
// automatically.
const logging = new Logging();
const log = logging.log(LOG_NAME);

export enum Level {
  ALL = 0,
  DEBUG = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

let LOG_LEVEL = Level.ALL;
export function setLogLevel(level: Level) {
  LOG_LEVEL = level;
}

export function debug(message: any, ...args: any[]) {
  if (LOG_LEVEL > Level.DEBUG) {
    return;
  }

  if (args) {
    console.log(message, ...args);
  } else {
    console.log(message);
  }
}

export function warn(message: any, ...args: any) {
  if (LOG_LEVEL > Level.WARN) {
    return;
  }

  if (args) {
    console.warn(message, ...args);
  } else {
    console.warn(message);
  }
}

export function error(message: any, ...args: any) {
  if (LOG_LEVEL > Level.ERROR) {
    return;
  }

  if (args) {
    console.error(message, ...args);
  } else {
    console.error(message);
  }
}

/**
 * Log JSON data.
 */
export function logData(data: any) {
  // Add a message (if there isn't one)
  if (!data.message) {
    data.message = JSON.stringify(data);
  }

  const entry = log.entry(METADATA, data);
  // Log (fire-and-forget)
  log.write(entry);
}
