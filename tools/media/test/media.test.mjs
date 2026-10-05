import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { convertOne } from '../src/process-images.mjs';
import { place, planPlacement, mergePagesJson } from '../src/place.mjs';
import { checkSizes } from '../src/check-sizes.mjs';
import { buildArgs, CRF_STEPS, compressOne } from '../src/compress-video.mjs';
import { parseArgs, hasTool } from '../src/common.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'media-'));
const png = (p, w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 90, b: 200 } } }).png().toFile(p);

test('parseArgs: values, booleans, unknown options', () => {
  assert.deepEqual(parseArgs(['--in', 'x', '--dry-run'], { in: '', 'dry-run': false, n: 5 }), { _: [], in: 'x', 'dry-run': true, n: 5 });
  assert.throws(() => parseArgs(['--nope'], { in: '' }), /Unknown option/);
  assert.throws(() => parseArgs(['--in'], { in: '' }), /needs a value/);
});

test('process-images: webp max width 1920, 480px thumbnail, idempotent', async () => {
  const d = tmp(); await png(join(d, 'big.png'), 3000, 1000); await png(join(d, 'small.png'), 400, 300);
  const r = await convertOne(join(d, 'big.png'), join(d, 'out'));
  assert.equal((await sharp(r.out).metadata()).width, 1920); assert.equal((await sharp(r.thumb).metadata()).width, 480);
  assert.equal((await sharp(r.out).metadata()).format, 'webp');
  const s = await convertOne(join(d, 'small.png'), join(d, 'out')); assert.equal((await sharp(s.out).metadata()).width, 400); // never upscaled
  assert.equal((await convertOne(join(d, 'big.png'), join(d, 'out'))).skipped, true);
  assert.equal((await convertOne(join(d, 'big.png'), join(d, 'out'), { force: true })).skipped, false);
});

test('place: SPEC 6.3 layout, index based names, dry-run writes nothing, idempotent, keeps edited pages.json', async () => {
  const d = tmp(), from = join(d, 'in'); mkdirSync(join(from, 'thumbs'), { recursive: true });
  for (const n of ['cover', 'poster', 'b-page', 'a-page']) { await png(join(from, `${n}.png`), 200, 100); await sharp(join(from, `${n}.png`)).webp().toFile(join(from, `${n}.webp`)); await sharp(join(from, `${n}.png`)).resize(50).webp().toFile(join(from, 'thumbs', `${n}.webp`)); }
  writeFileSync(join(from, 'video.mp4'), 'fake');
  const root = join(d, 'content');
  const dry = place('demo-report', from, root, { dryRun: true });
  assert.ok(dry.every((r) => r.status === 'new')); assert.equal(existsSync(root), false);
  place('demo-report', from, root);
  const media = join(root, 'demo-report', 'media');
  assert.deepEqual(readdirSync(join(media, 'pages')).sort(), ['01-demo-report.webp', '02-demo-report.webp', 'pages.json']);
  assert.deepEqual(readdirSync(join(media, 'thumbs')).sort(), ['01-demo-report.webp', '02-demo-report.webp']);
  assert.ok(existsSync(join(media, 'cover.webp')) && existsSync(join(media, 'poster.webp')) && existsSync(join(media, 'video.mp4')));
  const pj = JSON.parse(readFileSync(join(media, 'pages', 'pages.json'), 'utf8')); assert.equal(pj.length, 2);
  pj[0].title = 'Edited title'; writeFileSync(join(media, 'pages', 'pages.json'), JSON.stringify(pj));
  const again = place('demo-report', from, root);
  assert.ok(again.filter((r) => !r.to.endsWith('pages.json')).every((r) => r.status === 'unchanged'));
  assert.equal(JSON.parse(readFileSync(join(media, 'pages', 'pages.json'), 'utf8'))[0].title, 'Edited title');
  assert.deepEqual(mergePagesJson([{ file: 'x', title: 't', caption: 'c' }], ['x', 'y']), [{ file: 'x', title: 't', caption: 'c' }, { file: 'y', title: '', caption: '' }]);
  assert.equal(planPlacement('s', from, root).pageFiles.length, 2);
});

test('check-sizes: flags files over the limit, ignores node_modules and .git', () => {
  const d = tmp(); mkdirSync(join(d, 'node_modules')); mkdirSync(join(d, '.git'));
  writeFileSync(join(d, 'ok.bin'), Buffer.alloc(1024)); writeFileSync(join(d, 'big.bin'), Buffer.alloc(3 * 1024 * 1024)); writeFileSync(join(d, 'node_modules', 'huge.bin'), Buffer.alloc(5 * 1024 * 1024));
  const r = checkSizes(d, { limitMb: 2, warnTotalMb: 1 });
  assert.deepEqual(r.tooBig.map((f) => f.path.split(/[\\/]/).pop()), ['big.bin']); assert.equal(r.files, 2); assert.equal(r.warnTotal, true);
  assert.equal(checkSizes(d, { limitMb: 100 }).tooBig.length, 0);
});

test('compress-video: ffmpeg arguments and crf ladder', () => {
  const args = buildArgs('in.mov', 'out.mp4', 26);
  assert.ok(args.includes('-an') && args.includes('+faststart') && args.includes('libx264')); assert.equal(args[args.indexOf('-crf') + 1], '26');
  assert.match(args[args.indexOf('-vf') + 1], /min\(1920,iw\).*min\(1080,ih\)/);
  assert.deepEqual(CRF_STEPS(30), [30, 33, 36, 39]);
});

test('compress-video: end to end on a generated clip (skipped without ffmpeg)', { skip: !hasTool('ffmpeg') }, async () => {
  const d = tmp(); const src = join(d, 'clip.mp4');
  const g = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', '-pix_fmt', 'yuv420p', src]);
  assert.equal(g.status, 0);
  const r = await compressOne(src, join(d, 'out'), { targetMb: 10 });
  assert.ok(r.size > 0 && r.size < 10 * 1024 * 1024); assert.equal(r.overTarget, false);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'csv=p=0', r.output], { encoding: 'utf8' }).stdout;
  assert.match(probe, /h264,video,1920,1080/); assert.doesNotMatch(probe, /audio/);
  assert.equal((await sharp(r.poster).metadata()).format, 'webp');
});
