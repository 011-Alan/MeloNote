import Pitchfinder from 'pitchfinder';

const detectPitch =
  Pitchfinder.YIN();

export function detectFrequency(
  samples: Float32Array
) {
  const frequency =
    detectPitch(samples);

  return frequency || 0;
}