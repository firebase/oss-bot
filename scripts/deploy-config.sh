#!/usr/bin/env sh

if [ -z "$1" ]; then
  echo "Please specify a config file: ./deploy_config.sh /path/to/config.json (test|prod)"
  exit 1
fi

if [ -z "$2" ]; then
  echo "Please specify a project alias to deploy to: ./deploy_config.sh /path/to/config.json (test|prod)"
  exit 1
fi

CONFIG=$(node $(dirname "$0")/generate-config.js $(pwd -P)/$1)

if [ -z "$CONFIG" ]; then
  echo "Invalid config file specified! Make sure this file exists"
  exit 1
fi

COMMAND="firebase"

if [ -x "$(command -v npx)" ]; then
  COMMAND="npx firebase"
fi

$COMMAND functions:config:set --project $2 runtime.config="$CONFIG";
