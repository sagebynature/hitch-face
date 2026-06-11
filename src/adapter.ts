#!/usr/bin/env node

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8888/event';

type RequestModule = typeof http | typeof https;

type HitchEnvelope = {
  hitch_event_type?: unknown;
};

function isForwardableEnvelope(value: unknown): value is HitchEnvelope {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as HitchEnvelope).hitch_event_type === 'string' &&
    (value as HitchEnvelope).hitch_event_type !== ''
  );
}

async function readStdin(): Promise<string> {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
}

function requestModuleFor(url: URL): RequestModule | null {
  if (url.protocol === 'http:') return http;
  if (url.protocol === 'https:') return https;
  return null;
}

function postJson(urlText: string, body: string): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  let url: URL;

  try {
    url = new URL(urlText);
  } catch {
    resolve();
    return promise;
  }

  const requestModule = requestModuleFor(url);
  if (!requestModule) {
    resolve();
    return promise;
  }

  const request = requestModule.request(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString()
      },
      timeout: 750
    },
    response => {
      response.resume();
      response.on('end', resolve);
    }
  );

  request.on('error', resolve);
  request.on('timeout', () => {
    request.destroy();
    resolve();
  });

  request.end(body);
  return promise;
}

async function main(): Promise<void> {
  const input = await readStdin();
  if (!input) return;

  let envelope: unknown;
  try {
    envelope = JSON.parse(input);
  } catch {
    return;
  }

  if (!isForwardableEnvelope(envelope)) return;

  await postJson(process.env.HITCH_FACE_URL || DEFAULT_ENDPOINT, input);
}

if (require.main === module) {
  main().catch(() => {
    process.exitCode = 0;
  });
}

export { DEFAULT_ENDPOINT, isForwardableEnvelope, postJson };
