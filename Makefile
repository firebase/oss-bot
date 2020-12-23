PROJECT ?= ossbot-test

check-config:
	echo "Project is $(PROJECT)"
	./scripts/moveconfig.sh

build-functions: functions/src/*.ts functions/src/test/*.ts
	cd functions \
		&& npm install \
		&& npm run build \
		&& cd -

test-functions: build-functions
	cd functions \
		&& npm run test-ts \
		&& cd -

deploy-hosting:
	firebase --project=$(PROJECT) deploy --only hosting

deploy-functions-config:
	cd functions \
		&& ./node_modules/.bin/ts-node src/scripts/deploy-config.ts config/config.json $(PROJECT)	\
		&& cd -

deploy-functions: test-functions
	firebase --project=$(PROJECT) deploy --only functions

deploy: check-config deploy-functions-config deploy-functions deploy-hosting
