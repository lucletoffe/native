import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { getAssetData, getAssetSize } = require('metro/private/Assets');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/p8AAAAASUVORK5CYII=',
  'base64',
);
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('Metro image assets with the patched image parser', () => {
  it('reads image dimensions from a buffer', () => {
    expect(getAssetSize('png', png, 'icon.png')).toEqual({ width: 1, height: 1 });
  });

  it.each(['images', 'images.zip'])('bundles a scaled image from disk (%s)', async (folder) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'bulwark-metro-'));
    directories.push(directory);
    const imageDirectory = path.join(directory, folder);
    mkdirSync(imageDirectory);
    const filename = path.join(imageDirectory, 'icon@2x.png');
    writeFileSync(filename, png);
    const data = await getAssetData(filename, folder + '/icon@2x.png', [], 'android', '/assets');
    expect(data).toMatchObject({ width: 0.5, height: 0.5, scales: [2], type: 'png' });
    expect(data.files).toEqual([filename]);
  });

  it('rejects an ICNS entry with zero length without hanging the build', () => {
    // A valid first entry followed by a zero-sized entry used to loop forever.
    const malformed = Buffer.alloc(24);
    malformed.write('icns');
    malformed.writeUInt32BE(24, 4);
    malformed.write('icp4', 8);
    malformed.writeUInt32BE(8, 12);
    malformed.write('icp4', 16);
    const result = execFileSync(process.execPath, ['-e', `
      const { imageSize } = require('image-size');
      try { imageSize(Buffer.from(process.argv[1], 'hex')); process.exit(1); }
      catch { process.stdout.write('rejected'); }
    `, malformed.toString('hex')], { cwd: process.cwd(), timeout: 3000, encoding: 'utf8' });
    expect(result).toBe('rejected');
  });
});
