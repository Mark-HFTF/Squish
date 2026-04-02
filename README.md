# Squish

Native desktop media compressor made by Hi from the Future.

![Squish desktop app](public/images/squish.webp)

## Overview

Squish is an Electron desktop app that uses your local FFmpeg install to batch-compress videos and images without the browser-memory limits of FFmpeg.wasm.

Current repo/app version: `0.1.1`

## What Squish Does

- Compresses local videos into web-delivery outputs.
- Compresses local images into tiered WebP outputs.
- Creates poster images from videos as `-poster.webp`.
- Supports alpha-aware video exports for transparent sources.
- Writes finished files directly to disk.
- Can save into a chosen output folder or directly beside the source media.
- Stops the active FFmpeg process and removes unfinished partial outputs.

## Video Outputs

Video exports use the selected format and tier checkboxes.

Formats:

- `MP4`
- `WebM`

Tiers:

- `source`
- `720p`
- `480p`
- `240p`

Behavior:

- Aspect ratio is preserved inside each tier bounding box.
- No crop, no stretch, no forced widescreen conversion.
- Small sources are not upscaled.
- MP4 outputs are web-optimized for streaming.
- WebM outputs use the app's web-delivery encoding path and size guard logic.

## Image Outputs

Image compression exports WebP files using the same tier checkboxes as video.

Examples:

- `image-source.webp`
- `image-720p.webp`
- `image-480p.webp`
- `image-240p.webp`

## Alpha and Poster Support

- `Has alpha` enables the transparent-video path for sources that actually contain alpha.
- Alpha WebM output is supported when the installed FFmpeg build exposes a supported alpha-capable WebM encoder path.
- Safari alpha MP4 output requires a verified HEVC alpha encoder path and may not be available on many Windows FFmpeg builds.
- `Poster image` adds a WebP poster generated from the first video frame.
- There is also a dedicated poster-only drop target for exporting just `-poster.webp`.

## FFmpeg Setup

Squish uses native local FFmpeg, not FFmpeg.wasm.

On launch, Squish will try to:

1. Reuse a previously saved FFmpeg path.
2. Detect `ffmpeg` and `ffprobe` automatically.
3. Let you choose an existing FFmpeg install with `Locate FFmpeg`.
4. On Windows, install FFmpeg for you with `Install FFmpeg`.

The built-in Windows installer downloads the current full build from:

`https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.zip`

## Local Development

1. Install Node.js.
2. Run `npm install`.
3. Run `npm run app`.

Other useful commands:

- `npm run build`
- `npm run test`
- `npm run dist:win`

## Windows Build

To create a portable Windows executable:

```bash
npm run dist:win
```

The packaged app version is taken from [package.json](package.json).

## Notes

- Large source files should be much more reliable than the old browser-based version.
- Help menu now shows the current app version.
- Queue entries include output tables with file sizes and dimensions.
- The repo includes a `.gitignore` for common local-only files and build outputs.

## GitHub Upload

- Do not upload `node_modules`, packaged `.exe` files, or release output folders.
- Do not upload generated `dist` output unless you intentionally want built assets in the repo.
- Use the included `.gitignore` when pushing with git or GitHub Desktop.
