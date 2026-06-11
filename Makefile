.PHONY: deps build build-adapter start test package package-mac package-win install-extension install-local clean

deps:
	npm ci

build: build-adapter

build-adapter:
	npm run build:adapter

start:
	npm start

test:
	npm test

package: build
	npm run dist

package-mac: build
	npm run dist:mac

package-win: build
	npm run dist:win

install-extension: build-adapter
	node scripts/install-extension.js

install-local:
	./install.sh

clean:
	rm -rf dist release out
