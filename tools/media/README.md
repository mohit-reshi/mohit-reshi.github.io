# tools/media

Four small Node scripts (Node 20+, `sharp` for images, `ffmpeg` for video). Windows PowerShell examples below; run them from the repo root.

```powershell
cd tools\media; npm install; cd ..\..
```

| Script | What it does | Example |
|---|---|---|
| `compress-video` | Recording -> H.264 MP4, 1080p max, no audio, `faststart`, CRF raised in steps until about 10 MB; also a WebP poster. Warns (exit 2) above the target. | `node tools\media\src\compress-video.mjs --in D:\recordings --out out\video` |
| `process-images` | PNG/JPG -> WebP (quality 82, max width 1920) and 480 px thumbnails in `thumbs\`. Skips up-to-date files. | `node tools\media\src\process-images.mjs --in out\my-report\pages --out out\images\my-report` |
| `place` | Copies results into `content\projects\<slug>\media\` per SPEC 6.3 (`cover.webp`, `poster.webp`, `video.mp4`, `pages\NN-<slug>.webp`, `thumbs\`) and writes/merges a `pages\pages.json` stub. Idempotent. `--dry-run` shows the plan. | `node tools\media\src\place.mjs --slug my-report --from out\images\my-report --dry-run` |
| `check-sizes` | Fails (exit 1) if any file is over 100 MB (GitHub limit); warns when the tree passes 800 MB. | `node tools\media\src\check-sizes.mjs --root .` |

`place` treats files named `cover.webp`, `poster.webp`, `video.mp4`, `before.webp` and `after.webp` as the special media; every other `.webp` in the folder becomes a gallery page, numbered in name order
(`01-my-report.webp`, `02-...`). Existing titles/captions in `pages.json` are kept when you re-run it.

If `ffmpeg` is missing the video script prints install instructions: `winget install Gyan.FFmpeg` or `choco install ffmpeg`, then open a new PowerShell window.

Tests: `npm test` (the video test is skipped when ffmpeg is not installed).
