#!/usr/bin/env sh

if [ -z "$1" ]; then
  echo "Please specify a config file: ./deploy_config.sh /path/to/config.json (test|prod)"
  exit 1
fi

if [ -z "$2" ]; then
  echo "Please specify a project alias to deploy to: ./deploy_config.sh /path/to/config.json (test | prod)"
  exit 1
fi

CONFIG=$(node -e "console.log(JSON.stringify(require('fs').readFileSync('$1').toString()));")
COMMAND="firebase"

if [ -x "$(command -v npx)" ]; then
  COMMAND="npx firebase"
fi

$COMMAND functions:config:set --project $2 runtime.config="$CONFIG";
