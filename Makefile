build: functions/src/*.ts functions/src/test/*.ts
	cd functions && npm install && npm run build && cd -

test: build
	cd functions && npm run test-ts && cd -

deploy-test: test
	ts-node functions/src/scripts/deploy-config.ts functions/src/test/mock_data/config.json test
	firebase --project=test deploy

deploy: test
	ts-node functions/src/scripts/deploy-config.ts functions/config/config.json ossbot
	firebase --project=ossbot deploy