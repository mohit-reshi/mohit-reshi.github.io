import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { makeZip } from '../../../tools/site/make-app-packages.mjs';

/** Reads the central directory and inflates each entry, so the test checks a real, extractable zip. */
function readZip(buf: Buffer) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28);
    const lho = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const body = buf.subarray(start, start + csize);
    out[name] = (method === 8 ? zlib.inflateRawSync(body) : body).toString('utf8');
    p += 46 + nlen;
  }
  return out;
}

describe('makeZip', () => {
  it('round-trips files, compressed and stored', () => {
    const files = [
      { name: 'app/index.html', data: Buffer.from('<p>hello</p>'.repeat(200)) },
      { name: 'app/tiny.txt', data: Buffer.from('x') },
    ];
    expect(readZip(makeZip(files))).toEqual({ 'app/index.html': files[0].data.toString(), 'app/tiny.txt': 'x' });
  });
  it('is reproducible', () => {
    const f = [{ name: 'a.txt', data: Buffer.from('same') }];
    expect(makeZip(f).equals(makeZip(f))).toBe(true);
  });
});
