import { PRESETS } from '../config.js';

function normalizeEncoderSet(availableEncoders) {
  if (availableEncoders instanceof Set) {
    return availableEncoders;
  }

  if (Array.isArray(availableEncoders)) {
    return new Set(availableEncoders);
  }

  return new Set();
}

function selectProfile(profiles, availableEncoders) {
  return profiles.find((profile) => availableEncoders.has(profile.encoder)) ?? null;
}

export function resolveCodecSupport(availableEncoders) {
  const encoderSet = normalizeEncoderSet(availableEncoders);
  const formats = {};
  const images = {};
  const notices = [];
  const errors = [];

  for (const format of Object.values(PRESETS.formats)) {
    const videoProfile = selectProfile(format.videoProfiles, encoderSet);
    const audioProfile = selectProfile(format.audioProfiles, encoderSet);
    const supported = Boolean(videoProfile && audioProfile);

    formats[format.id] = {
      formatId: format.id,
      videoProfile,
      audioProfile,
      supported,
    };

    if (!videoProfile) {
      errors.push(`No supported ${format.label} video encoder was found in this FFmpeg build.`);
    }

    if (!audioProfile) {
      errors.push(`No supported ${format.label} audio encoder was found in this FFmpeg build.`);
    }

    const preferredVideo = format.videoProfiles[0];
    if (videoProfile && preferredVideo && videoProfile.encoder !== preferredVideo.encoder) {
      notices.push(`Using ${videoProfile.label} for ${format.label} because ${preferredVideo.encoder} is not available in this FFmpeg build.`);
    }
  }

  const imageProfile = selectProfile(PRESETS.images.format.videoProfiles, encoderSet);
  images.webp = {
    formatId: PRESETS.images.format.id,
    videoProfile: imageProfile,
    supported: Boolean(imageProfile),
  };

  if (!imageProfile) {
    notices.push('This FFmpeg build cannot create WebP images because no supported WebP encoder was found.');
  }

  return {
    supported: errors.length === 0,
    formats,
    images,
    notices,
    errors,
  };
}
