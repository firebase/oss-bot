import { spawn, ChildProcess } from "child_process";
import * as chalk from "chalk";

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
  const projectID = process.argv[3];
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

  npm run task:get-runtime-config > .runtimeconfig.json
  export CLOUD_RUNTIME_CONFIG=$PWD/.runtimeconfig.json
  ${chalk.green(
    "--------------------------------------------------------------------"
  )}
  `);
  return JSON.stringify(config);
}
