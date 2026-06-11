const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HITCH_INSTALL_COMMAND, installExtension } = require('../../scripts/install-extension');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hitch-face-install-'));
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createSources(root) {
  const adapter = path.join(root, 'extension', 'dist', 'adapter.js');
  const manifest = path.join(root, 'extension', 'hitch-extension.toml');
  const defaultConfig = path.join(root, 'config.toml');
  writeFile(adapter, 'console.log("adapter");\n');
  writeFile(manifest, 'name = "hitch_face"\ncommand = ["node", "adapter.js"]\n');
  writeFile(defaultConfig, 'port = 8888\n');
  return { adapter, manifest, defaultConfig };
}

function installWithTempEnv(home, hitchConfigDir, sources, extra = {}) {
  return withEnv({
    PATH: extra.PATH || '',
    HITCH_FACE_HITCH_CONFIG_DIR: hitchConfigDir,
    HITCH_FACE_CONFIG_DIR: path.join(home, '.config', 'hitch-face')
  }, () => installExtension({
    targetHome: home,
    adapter: sources.adapter,
    manifest: sources.manifest,
    defaultConfig: sources.defaultConfig,
    allowMissingHitch: Boolean(extra.allowMissingHitch),
    quiet: true,
    json: false
  }));
}

async function main() {
  console.log('Running install helper tests...');

  {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const sources = createSources(path.join(root, 'src'));
    const hitchConfigDir = path.join(root, 'missing-hitch');

    const result = installWithTempEnv(home, hitchConfigDir, sources);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'hitch-not-found');
    assert.strictEqual(result.installCommand, HITCH_INSTALL_COMMAND);
    assert.strictEqual(fs.existsSync(path.join(hitchConfigDir, 'extensions', 'hitch-face')), false);
  }

  {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const sources = createSources(path.join(root, 'src'));
    const hitchConfigDir = path.join(root, 'hitch');
    writeFile(path.join(hitchConfigDir, 'config.toml'), '[server]\nport = 8799\n');

    const result = installWithTempEnv(home, hitchConfigDir, sources);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.hitchFound, true);
    assert.strictEqual(fs.readFileSync(path.join(hitchConfigDir, 'extensions', 'hitch-face', 'adapter.js'), 'utf8'), fs.readFileSync(sources.adapter, 'utf8'));
    assert.strictEqual(fs.readFileSync(path.join(hitchConfigDir, 'extensions', 'hitch-face', 'config.toml'), 'utf8'), fs.readFileSync(sources.manifest, 'utf8'));
    assert.strictEqual(fs.readFileSync(path.join(home, '.config', 'hitch-face', 'config.toml'), 'utf8'), fs.readFileSync(sources.defaultConfig, 'utf8'));
    assert.strictEqual(result.createdConfig, true);
  }

  {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const sources = createSources(path.join(root, 'src'));
    const hitchConfigDir = path.join(root, 'hitch');
    const appConfig = path.join(home, '.config', 'hitch-face', 'config.toml');
    writeFile(path.join(hitchConfigDir, 'extensions', '.keep'), '');
    writeFile(appConfig, 'port = 9999\n');

    const result = installWithTempEnv(home, hitchConfigDir, sources);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.createdConfig, false);
    assert.strictEqual(fs.readFileSync(appConfig, 'utf8'), 'port = 9999\n');
  }

  {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const sources = createSources(path.join(root, 'src'));
    const hitchConfigDir = path.join(root, 'hitch');
    const binDir = path.join(root, 'bin');
    const hitchBin = path.join(binDir, process.platform === 'win32' ? 'hitch.cmd' : 'hitch');
    writeFile(hitchBin, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n');
    fs.chmodSync(hitchBin, 0o755);

    const result = installWithTempEnv(home, hitchConfigDir, sources, { PATH: binDir });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.hitchFound, true);
    assert.ok(result.hitchReasons.some(reason => reason.includes('hitch binary')));
  }

  console.log('✅ PASS: install helper detects Hitch, installs extension, and preserves config');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
