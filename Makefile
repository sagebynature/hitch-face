.PHONY: deps build build-adapter build-native start test package package-mac package-win package-linux install-extension install-local clean

deps:
	npm ci

build: build-adapter build-native

build-adapter:
	npm run build:adapter

build-native:
	npm run build:native

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
	rm -rf dist release out spike-zero-native/zig-out spike-zero-native/.zig-cache spike-zero-native/frontend/dist
