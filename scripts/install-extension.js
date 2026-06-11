#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HITCH_INSTALL_COMMAND = 'curl -fsSL https://raw.githubusercontent.com/sagebynature/hitch/main/scripts/install.sh | sh';
const HITCH_URL = 'https://github.com/sagebynature/hitch';

function parseArgs(argv) {
  const options = {
    allowMissingHitch: false,
    quiet: false,
    json: false,
    targetHome: process.env.HITCH_FACE_TARGET_HOME || os.homedir(),
    adapter: process.env.HITCH_FACE_ADAPTER || '',
    manifest: process.env.HITCH_FACE_MANIFEST || '',
    defaultConfig: process.env.HITCH_FACE_DEFAULT_CONFIG || ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--allow-missing-hitch') options.allowMissingHitch = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--home') options.targetHome = argv[++i];
    else if (arg === '--adapter') options.adapter = argv[++i];
    else if (arg === '--manifest') options.manifest = argv[++i];
    else if (arg === '--default-config') options.defaultConfig = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function pathEntries(envPath = process.env.PATH || '') {
  return envPath.split(path.delimiter).filter(Boolean);
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExists(command, envPath = process.env.PATH || '') {
  const names = process.platform === 'win32' ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`] : [command];
  for (const dir of pathEntries(envPath)) {
    for (const name of names) {
      if (isExecutable(path.join(dir, name))) return true;
    }
  }
  return false;
}

function configRoot(home) {
  return process.env.HITCH_FACE_HITCH_CONFIG_DIR || path.join(home, '.config', 'hitch');
}

function appConfigRoot(home) {
  return process.env.HITCH_FACE_CONFIG_DIR || path.join(home, '.config', 'hitch-face');
}

function detectHitch(home) {
  const root = configRoot(home);
  const reasons = [];

  if (commandExists('hitch')) reasons.push('hitch binary found on PATH');
  if (commandExists('hitch-client')) reasons.push('hitch-client binary found on PATH');
  if (fs.existsSync(path.join(root, 'config.toml'))) reasons.push(`${path.join(root, 'config.toml')} exists`);
  if (fs.existsSync(path.join(root, 'extensions'))) reasons.push(`${path.join(root, 'extensions')} exists`);

  return { found: reasons.length > 0, reasons };
}

function candidateRoots() {
  const roots = [];
  if (process.resourcesPath) roots.push(path.join(process.resourcesPath, 'hitch-face'));
  roots.push(path.resolve(__dirname, '..'));
  roots.push(process.cwd());
  return roots;
}

function firstExisting(paths) {
  for (const file of paths) {
    if (file && fs.existsSync(file)) return file;
  }
  return '';
}

function resolveSources(options) {
  const roots = candidateRoots();
  const adapter = firstExisting([
    options.adapter,
    ...roots.map(root => path.join(root, 'extension', 'dist', 'adapter.js')),
    ...roots.map(root => path.join(root, 'adapter.js')),
    ...roots.map(root => path.join(root, 'dist', 'adapter.js'))
  ]);
  const packagedResourceRoot = process.resourcesPath ? path.join(process.resourcesPath, 'hitch-face') : '';
  const manifest = firstExisting([
    options.manifest,
    ...roots.map(root => path.join(root, 'extension', 'hitch-extension.toml')),
    packagedResourceRoot ? path.join(packagedResourceRoot, 'config.toml') : '',
    ...roots.map(root => path.join(root, 'hitch-extension.toml'))
  ]);
  const defaultConfig = firstExisting([
    options.defaultConfig,
    packagedResourceRoot ? path.join(packagedResourceRoot, 'default-config.toml') : '',
    ...roots.map(root => path.join(root, 'config.toml'))
  ]);

  if (!adapter) throw new Error('Cannot find built adapter.js. Run npm run build:adapter first.');
  if (!manifest) throw new Error('Cannot find Hitch extension manifest.');
  if (!defaultConfig) throw new Error('Cannot find default Hitch Face config.toml.');

  return { adapter, manifest, defaultConfig };
}

function copyFile(source, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
}

function installExtension(options) {
  const home = path.resolve(options.targetHome);
  const hitch = detectHitch(home);

  if (!hitch.found && !options.allowMissingHitch) {
    return {
      ok: false,
      skipped: true,
      reason: 'hitch-not-found',
      message: `Hitch is not installed. Install Hitch first: ${HITCH_INSTALL_COMMAND}`,
      installCommand: HITCH_INSTALL_COMMAND,
      url: HITCH_URL
    };
  }

  const sources = resolveSources(options);
  const extensionDir = path.join(configRoot(home), 'extensions', 'hitch-face');
  const appConfigDir = appConfigRoot(home);
  const appConfigPath = path.join(appConfigDir, 'config.toml');

  copyFile(sources.adapter, path.join(extensionDir, 'adapter.js'));
  copyFile(sources.manifest, path.join(extensionDir, 'config.toml'));

  fs.mkdirSync(appConfigDir, { recursive: true });
  let createdConfig = false;
  if (!fs.existsSync(appConfigPath)) {
    fs.copyFileSync(sources.defaultConfig, appConfigPath);
    createdConfig = true;
  }

  return {
    ok: true,
    skipped: false,
    hitchFound: hitch.found,
    hitchReasons: hitch.reasons,
    extensionDir,
    appConfigPath,
    createdConfig
  };
}

function printResult(result, options) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (options.quiet) return;

  if (!result.ok) {
    process.stderr.write(`${result.message}\n${result.url}\n`);
    return;
  }

  process.stdout.write(`Installed Hitch Face extension: ${result.extensionDir}\n`);
  process.stdout.write(`Config: ${result.appConfigPath}${result.createdConfig ? ' (created)' : ' (preserved)'}\n`);
  if (!result.hitchFound) {
    process.stdout.write(`Hitch was not detected; extension files were staged only. Install Hitch: ${HITCH_INSTALL_COMMAND}\n`);
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = installExtension(options);
  printResult(result, options);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  HITCH_INSTALL_COMMAND,
  HITCH_URL,
  commandExists,
  detectHitch,
  installExtension,
  main,
  parseArgs,
  resolveSources
};
