build:
	cd functions && npm install && npm run build && cd -

test: build
	cd functions && npm run test-ts && cd -

deploy-test: test
	firebase --project=test deploy

deploy: test
	firebase --project=ossbot deploy