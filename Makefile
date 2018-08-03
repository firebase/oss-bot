TEST_PROJECT="ossbot-test"
PROD_PROJECT="ossbot-f0cad"

build-appengine:
	cd appengine \
		&& npm install \
		&& cd -

deploy-appengine-test: build-appengine
	gcloud config set project $(TEST_PROJECT)
	cd appengine \
		&& npm run deploy \
        && cd -

deploy-appengine-prod: build-appengine
	gcloud config set project $(PROD_PROJECT)
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

deploy-functions-config-prod:
	functions/node_modules/.bin/ts-node functions/src/scripts/deploy-config.ts functions/config/config.json $(PROD_PROJECT)

deploy-functions-config-test:
	functions/node_modules/.bin/ts-node functions/src/scripts/deploy-config.ts functions/src/test/mock_data/config.json $(TEST_PROJECT)

deploy-functions-test: test-functions deploy-functions-config-test
	firebase --project=$(TEST_PROJECT) deploy

deploy-functions-prod: test-functions deploy-functions-config-prod
	firebase --project=$(PROD_PROJECT) deploy

deploy-test: deploy-appengine-test deploy-functions-test

deploy-prod: deploy-appengine-prod deploy-functions-prod
