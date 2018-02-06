const client = require("firebase-tools");
const fs = require("fs");

if (process.argv.length < 4) {
  console.log(
    "Please specify a config file and projec5: node deploy-config.js $FILE $PROJECT"
  );
  return;
}

const configFile = process.argv[2];
const project = process.argv[3];

// Source: https://gist.github.com/penguinboy/762197
function flattenObject(ob) {
  var toReturn = {};

  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) {
      continue;
    }

    if (typeof ob[i] == "object") {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
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

const configFileString = fs.readFileSync(configFile).toString();
const config = {
  runtime: {
    config: JSON.parse(configFileString)
  }
};

const flatConfig = flattenObject(config);

console.log(`Deploying ${configFile} to ${project}.`);

// Construct key=val args for config.set
let args = [];
for (let key in flatConfig) {
  let cleanKey = key.toLowerCase();
  let cleanVal = flatConfig[key];

  args.push(`${cleanKey}=${cleanVal}`);
}
console.log(args);

return client.functions.config
  .set(args, {
    project: project
  })
  .then(console.log)
  .catch(function(e) {
    console.warn(e);
    console.warn(JSON.stringify(e.context.body.error.details));
  });
