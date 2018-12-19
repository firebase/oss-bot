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
