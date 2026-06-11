.PHONY: deps build build-adapter build-app start test package package-mac package-win package-linux install-extension install-local clean

deps:
	npm ci

build: build-adapter build-app

build-adapter:
	npm run build:adapter

build-app:
	npm run build:app

start:
	npm start

test:
	npm test

package: package-mac

package-mac: build-adapter
	npm run dist:mac

package-win: build-adapter
	npm run dist:win

package-linux: build-adapter
	npm run dist:linux

install-extension: build-adapter
	node scripts/install-extension.js

install-local:
	./install.sh

clean:
	rm -rf release out app/zig-out app/.zig-cache app/frontend/dist app/tmp-home extension/dist
