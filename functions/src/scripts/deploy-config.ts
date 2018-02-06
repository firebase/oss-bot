import * as fs from "fs";

const firebase = require("firebase-tools");

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

async function deployConfig(configFile: string, project: string) {
  const configFileString = fs.readFileSync(configFile).toString();
  const config = {
    runtime: {
      config: JSON.parse(configFileString)
    }
  };

  const flatConfig = flattenObject(config);

  console.log(`Deploying ${configFile} to ${project}.`);

  // Construct key=val args for config.set
  const args = [];
  for (const key in flatConfig) {
    const cleanKey = key.toLowerCase();
    const cleanVal = flatConfig[key];

    args.push(`${cleanKey}=${cleanVal}`);
  }
  console.log(args);

  // Unset the 'runtime' config variable and all children
  await firebase.functions.config.unset(["runtime"], {
    project: project
  });

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
    process.exit(1);
  });
