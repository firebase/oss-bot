import { writeFileSync } from "fs";
import { spawn, ChildProcess } from "child_process";
import { default as chalk } from "chalk";

async function asyncSpawn(proc: ChildProcess): Promise<string> {
  let full_data = "";
  let full_error = "";
  return new Promise<string>((resolve, reject) => {
    proc.stdout.on("data", (data: string) => {
      full_data += data;
    });

    proc.stderr.on("error", (error: string) => {
      full_error += error;
    });

    proc.on("close", (code: number) => {
      if (code == 0) {
        resolve(full_data);
      } else {
        reject(full_error);
      }
    });
  });
}

export async function GetRuntimeConfig() {
  let projectID = "";
  let runtimeConfigFile = ".runtimeconfig.json";

  if (process.argv.length >= 4) {
    projectID = process.argv[3];
  } else {
    throw "Must pass firebase project";
  }

  if (process.argv.length >= 5) {
    runtimeConfigFile = process.argv[4];
  }

  const ft = spawn("npx", [
    "firebase",
    "functions:config:get",
    `--project=${projectID}`
  ]);

  const config = JSON.parse(await asyncSpawn(ft));
  config.firebase = {
    databaseURL: `https://${projectID}.firebaseio.com`
  };

  console.warn(`
  ${chalk.green(
    "--------------------------------------------------------------------"
  )}
  ${chalk.blue("To use this script...")}

  export CLOUD_RUNTIME_CONFIG=$PWD/${runtimeConfigFile}
  ${chalk.green(
    "--------------------------------------------------------------------"
  )}
  `);

  writeFileSync(runtimeConfigFile, JSON.stringify(config, undefined, 2));
}
