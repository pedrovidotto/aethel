import { Point3D, LANDMARK_INDICES, dist2D } from './metrics';

export type GateStatus = 'pass' | 'warn' | 'fail';

export interface GateCheckResult {
  id: 'brightness' | 'evenLighting' | 'headPose' | 'expression' | 'distance';
  label: string;
  status: GateStatus;
  valueSummary: string;
  message: string;
}

export interface QualityGateReport {
  overallStatus: GateStatus;
  canCapture: boolean;
  checks: GateCheckResult[];
  poseDegrees: { yaw: number; pitch: number; roll: number };
  estimatedDistanceCm: number;
}

/**
 * Extracts yaw, pitch, and roll in degrees from MediaPipe's 4x4 column-major facial transformation matrix.
 */
export function extractPoseFromMatrix(matrixData?: number[] | Float32Array): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  if (!matrixData || matrixData.length < 16) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }
  // Column-major 4x4 rotation elements
  const r00 = matrixData[0];
  const r10 = matrixData[1];
  const r20 = matrixData[2];
  const r21 = matrixData[6];
  const r22 = matrixData[10];

  const pitchRad = Math.atan2(-r21, r22);
  const yawRad = Math.atan2(r20, Math.hypot(r21, r22));
  const rollRad = Math.atan2(r10, r00);

  return {
    yaw: Number(((yawRad * 180) / Math.PI).toFixed(1)),
    pitch: Number(((pitchRad * 180) / Math.PI).toFixed(1)),
    roll: Number(((rollRad * 180) / Math.PI).toFixed(1))
  };
}

/**
 * Evaluates mean luma, clipped pixel share, and left/right luma ratio inside the face bounding box.
 */
export function analyzeFaceLighting(
  imageData: ImageData,
  landmarks: Point3D[]
): {
  meanLuma: number;
  clippedSharePct: number;
  leftRightRatio: number;
} {
  const { width, height, data } = imageData;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (const pt of landmarks) {
    const px = Math.floor(pt.x * width);
    const py = Math.floor(pt.y * height);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  minX = Math.max(0, minX);
  maxX = Math.min(width - 1, maxX);
  minY = Math.max(0, minY);
  maxY = Math.min(height - 1, maxY);

  const midX = Math.floor((minX + maxX) / 2);

  let totalLuma = 0;
  let totalPixels = 0;
  let clippedPixels = 0;
  let leftLumaSum = 0;
  let leftCount = 0;
  let rightLumaSum = 0;
  let rightCount = 0;

  // Step by 2 pixels for >20fps real-time performance
  for (let y = minY; y <= maxY; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      totalLuma += luma;
      totalPixels++;

      if (luma <= 5 || luma >= 250) {
        clippedPixels++;
      }

      if (x < midX) {
        leftLumaSum += luma;
        leftCount++;
      } else {
        rightLumaSum += luma;
        rightCount++;
      }
    }
  }

  if (totalPixels === 0) {
    return { meanLuma: 128, clippedSharePct: 0, leftRightRatio: 1.0 };
  }

  const meanLuma = totalLuma / totalPixels;
  const clippedSharePct = (clippedPixels / totalPixels) * 100;
  const leftMean = leftCount > 0 ? leftLumaSum / leftCount : 128;
  const rightMean = rightCount > 0 ? rightLumaSum / rightCount : 128;
  const leftRightRatio =
    Math.max(leftMean, rightMean) / Math.max(Math.min(leftMean, rightMean), 1);

  return {
    meanLuma: Number(meanLuma.toFixed(1)),
    clippedSharePct: Number(clippedSharePct.toFixed(2)),
    leftRightRatio: Number(leftRightRatio.toFixed(2))
  };
}

/**
 * Estimates camera distance in cm from horizontal iris diameter in pixels (mean adult iris = 11.7 mm)
 * and estimated focal length in pixels.
 */
export function estimateCameraDistanceCm(
  landmarks: Point3D[],
  imageWidth: number,
  exifFocalLength35mm?: number,
  exifSubjectDistanceMeters?: number
): number {
  if (exifSubjectDistanceMeters && exifSubjectDistanceMeters > 0.1) {
    return Number((exifSubjectDistanceMeters * 100).toFixed(0));
  }

  const scalePt = (i: number) => ({
    x: landmarks[i].x * imageWidth,
    y: landmarks[i].y * imageWidth,
    z: 0
  });

  const leftIrisPx = dist2D(scalePt(469), scalePt(471));
  const rightIrisPx = dist2D(scalePt(474), scalePt(476));
  const meanIrisPx = (leftIrisPx + rightIrisPx) / 2;

  if (meanIrisPx <= 0.5) return 85;

  // Default typical webcam / front camera equivalent focal length (~28mm on 36mm full-frame sensor width)
  const eqFocalMm = exifFocalLength35mm && exifFocalLength35mm > 10 ? exifFocalLength35mm : 28;
  const focalLengthPx = (eqFocalMm / 36) * imageWidth;
  const IRIS_MM = 11.7;
  const distanceMm = (focalLengthPx * IRIS_MM) / meanIrisPx;

  return Number((distanceMm / 10).toFixed(0));
}

export function evaluateQualityGate(params: {
  landmarks: Point3D[];
  imageData?: ImageData;
  transformationMatrix?: number[] | Float32Array;
  blendshapes?: { categoryName: string; score: number }[];
  imageWidth: number;
  exifFocalLength35mm?: number;
  exifSubjectDistanceMeters?: number;
}): QualityGateReport {
  const {
    landmarks,
    imageData,
    transformationMatrix,
    blendshapes = [],
    imageWidth,
    exifFocalLength35mm,
    exifSubjectDistanceMeters
  } = params;

  const lighting = imageData
    ? analyzeFaceLighting(imageData, landmarks)
    : { meanLuma: 130, clippedSharePct: 0.5, leftRightRatio: 1.05 };

  // 1. Brightness check: Mean luma 90 to 190 of 255, clipped pixels under 2%
  let brightnessStatus: GateStatus = 'pass';
  let brightnessMsg = 'Face illumination and exposure are within range.';
  if (lighting.meanLuma < 90 || lighting.meanLuma > 190 || lighting.clippedSharePct >= 2.0) {
    brightnessStatus =
      lighting.meanLuma < 70 || lighting.meanLuma > 210 || lighting.clippedSharePct >= 5.0
        ? 'fail'
        : 'warn';
    brightnessMsg =
      lighting.meanLuma < 90
        ? 'Face is underexposed. Move toward a brighter, even light source.'
        : lighting.meanLuma > 190
        ? 'Face is overexposed. Reduce direct harsh lighting.'
        : `Clipped highlights/shadows (${lighting.clippedSharePct}% >= 2%). Soften lighting.`;
  }

  // 2. Even lighting check: Left vs Right half luma ratio < 1.25
  let evenStatus: GateStatus = 'pass';
  let evenMsg = 'Left and right sides of the face are evenly lit.';
  if (lighting.leftRightRatio >= 1.25) {
    evenStatus = lighting.leftRightRatio >= 1.45 ? 'fail' : 'warn';
    evenMsg = `Uneven side lighting detected (ratio ${lighting.leftRightRatio} >= 1.25). Face the light source squarely.`;
  }

  // 3. Head pose check: |yaw| < 5 deg, |pitch| < 5 deg. Roll is measured & corrected in metrics.
  const poseDegrees = extractPoseFromMatrix(transformationMatrix);
  let poseStatus: GateStatus = 'pass';
  let
