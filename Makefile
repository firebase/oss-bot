PROJECT ?= ossbot-test

check-config:
	echo "Project is $(PROJECT)"
	./scripts/moveconfig.sh

build-appengine:
	cd appengine \
		&& npm install \
		&& cd -

deploy-appengine: build-appengine
	gcloud config set project $(PROJECT)
	cd appengine \
		&& npm run deploy \
        && cd -

build-functions: functions/src/*.ts functions/src/test/*.ts
	cd functions \
		&& npm install \
		&& npm run build \
		&& cd -

test-functions: build-functions
	cd functions \
		&& npm run test-ts \
		&& cd -

deploy-metrics-config:
	firebase --project=$(PROJECT) database:set -y /metrics metrics-config.json

deploy-hosting: deploy-metrics-config
	firebase --project=$(PROJECT) deploy --only hosting

deploy-functions-config:
	functions/node_modules/.bin/ts-node functions/src/scripts/deploy-config.ts functions/config/config.json $(PROJECT)	

deploy-functions: test-functions
	firebase --project=$(PROJECT) deploy --only functions

deploy: check-config deploy-appengine deploy-functions-config deploy-functions deploy-hosting
