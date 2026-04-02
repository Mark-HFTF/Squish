# Changelog

## v0.1.1

This release is the first substantial desktop-app expansion after `v0.1.0`.

### Added

- Automatic FFmpeg install flow for Windows, including download, extraction, verification, and saved-path reuse.
- Persistent FFmpeg configuration between launches.
- `Save beside source` output mode.
- Alpha-aware video mode with WebM alpha support and capability-gated Safari alpha output.
- Poster image generation from video sources.
- A dedicated poster-only drop target for exporting `-poster.webp`.
- A `240p` output tier in addition to `source`, `720p`, and `480p`.
- Tier-based image WebP exports so image jobs follow the same tier checkboxes as video jobs.
- Help menu version display and About dialog.

### Changed

- Video delivery settings now use a more explicit web-delivery ladder for MP4 and WebM.
- WebM alpha output now uses a dedicated alpha path and verifies that an alpha plane is present after encode.
- Poster generation now explicitly maps the first video stream to avoid wrong-stream poster outputs on some files.
- The Electron shell now includes more desktop-level wiring for saved FFmpeg paths, install progress, and menu handling.
- The renderer UI now includes install progress, more output toggles, more drop targets, and expanded queue/output handling.

### Notes

- The repo and app version are now aligned to `0.1.1`.
- Safari alpha MP4 output still depends on a verified HEVC alpha encoder path and may remain unavailable on many Windows FFmpeg builds.
