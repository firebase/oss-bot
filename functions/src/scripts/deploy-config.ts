import * as fs from "fs";
import { type } from "os";

const firebase = require("firebase-tools");

type StringMap = { [s: string]:string };

// Source: https://gist.github.com/penguinboy/762197
function flattenObject(ob: any): any {
  const toReturn: any = {};

  for (const i in ob) {
    if (!ob.hasOwnProperty(i)) {
      continue;
    }

    if (typeof ob[i] == "object") {
      const flatObject = flattenObject(ob[i]);
      for (const x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) {
          continue;
        }

        toReturn[i + "." + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

function toFlatMap(ob: any): StringMap {
  const flattened = flattenObject(ob);
  const result: StringMap = {};
  for (const key in flattened) {
    const cleanKey = key.toLowerCase();
    const cleanVal = flattened[key];

    result[cleanKey] = cleanVal;
  }

  return result;
}

async function deployConfig(configFile: string, project: string) {
  const configFileString = fs.readFileSync(configFile).toString();
  const config = {
    runtime: {
      config: JSON.parse(configFileString)
    }
  };

  const newConfig = toFlatMap(config);

  console.log(`Deploying ${configFile} to ${project}.`);

  const current = await firebase.functions.config.get("runtime", {
    project: project
  });

  const currentConfig = toFlatMap({
    runtime: current
  });

  const keysRemoved = [];
  const keysAddedOrChanged = [];

  for (const key in newConfig) {
    const newVal = "" + newConfig[key];
    const currentVal = "" + currentConfig[key];

    if (newVal === currentVal) {
      continue;
    }

    if (newVal === "" && currentVal !== "") {
      console.log(`REMOVED: ${key}`);
      console.log(`\tcurrent=${currentVal}`);
      keysRemoved.push(key);
    } else {
      console.log(`CHANGED: ${key}`);
      console.log(`\tcurrent=${currentVal}`);
      console.log(`\tnew=${newVal}`);
      keysAddedOrChanged.push(key);
    }
  }

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
    console.log("No config changes.")
    return;
  } 
    
  // Log out everything that is changing
  console.log(args);

  // Set the new config
  await firebase.functions.config.set(args, {
    project: project
  });
}

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
