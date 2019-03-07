import * as fs from "fs";
import * as encoding from "../shared/encoding";

const firebase = require("firebase-tools");

async function deployConfig(configFile: string, project: string) {
  console.log(`Deploying ${configFile} to ${project}.`);

  // Read the local JSON file and then wrap it in { runtime: config: { ... } }
  const configFileString = fs.readFileSync(configFile).toString();
  const config = {
    runtime: {
      config: JSON.parse(configFileString)
    }
  };

  // Encode the proposed config into a flat map of dot-separated values
  const newConfig = encoding.flattenConfig(config, encoding.Direction.ENCODE);

  // Get the current runtime config from Firebase as a giant object
  const current = await firebase.functions.config.get("runtime", {
    project: project
  });

  // Decode the config into a flat map of dot-separated values.
  const currentConfig = encoding.flattenConfig(
    {
      runtime: current
    },
    encoding.Direction.NONE
  );

  const keysRemoved: string[] = [];
  const keysAddedOrChanged: string[] = [];

  const newKeys = Object.keys(newConfig);
  const currentKeys = Object.keys(currentConfig);
  const allKeys = new Set([...newKeys, ...currentKeys]);

  allKeys.forEach((key: string) => {
    const newVal = "" + newConfig[key];
    const currentVal = "" + currentConfig[key];

    if (newKeys.indexOf(key) < 0 && currentKeys.indexOf(key) >= 0) {
      console.log(`REMOVED: ${key}`);
      console.log(`\tcurrent=${currentVal}`);
      keysRemoved.push(key);
    } else if (newVal !== currentVal) {
      console.log(`CHANGED: ${key}`);
      console.log(`\tcurrent=${currentVal}`);
      console.log(`\tnew=${newVal}`);
      keysAddedOrChanged.push(key);
    }
  });

  const args = [];
  if (keysRemoved.length > 0) {
    // If anything is removed we need to nuke and start over
    for (const key in newConfig) {
      const val = newConfig[key];
      args.push(`${key}=${val}`);
    }

    // Unset the 'runtime' config variable and all children
    await firebase.functions.config.unset(["runtime"], {
      project: project
    });
  } else {
    // Otherwise we can just update what changed
    for (const key of keysAddedOrChanged) {
      const val = newConfig[key];
      args.push(`${key}=${val}`);
    }
  }

  // If no changes, we're done
  if (args.length == 0) {
    console.log("No config changes.");
    return;
  }

  // Log out everything that is changing
  console.log(args);

  // Set the new config
  await firebase.functions.config.set(args, {
    project: project
  });
}

// =============================================
//                   MAIN
// =============================================

// Validate command-line arguments
if (process.argv.length < 4) {
  console.log(
    "Please specify a config file and project: ts-node deploy-config.ts $FILE $PROJECT"
  );
  process.exit(1);
}

const configFile = process.argv[2];
const project = process.argv[3];
deployConfig(configFile, project)
  .then(function() {
    console.log("Deployed.");
  })
  .catch(function(e) {
    console.warn(e);
    if (e.context && e.context.body) {
      console.warn(JSON.stringify(e.context.body));
    }
    process.exit(1);
  });
