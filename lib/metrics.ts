import { MetricKey } from './reference-ranges';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export type ConfidenceLevel = 'good' | 'moderate' | 'low';

export interface MetricResult {
  key: MetricKey;
  label: string;
  value: number;
  unit: string;
  iqr: number;
  confidence: ConfidenceLevel;
  notes: string;
  subValues?: Record<string, number>;
}

export type MetricsMap = Record<MetricKey, MetricResult>;

/**
 * VERIFIED MEDIAPIPE 478-POINT LANDMARK TOPOLOGY INDICES
 * - 33: Photo-left lateral canthus (outer eye corner) [Verified]
 * - 133: Photo-left medial canthus (inner eye corner) [Verified]
 * - 362: Photo-right medial canthus (inner eye corner) [Verified]
 * - 263: Photo-right lateral canthus (outer eye corner) [Verified]
 * - 145: Photo-left lower eyelid center [Verified]
 * - 374: Photo-right lower eyelid center [Verified]
 * - 468: Photo-left iris center; 469..472: iris contour [Verified]
 * - 473: Photo-right iris center; 474..477: iris contour [Verified]
 * - 9: Glabella (brow midline) [Verified]
 * - 2: Subnasale (base of nasal septum) [Verified]
 * - 152: Menton (inferior chin border) [Verified]
 * - 10: Superior central mesh point (used as default hairline proxy unless user overrides) [Proxy]
 * - 127/356 (upper contour), 172/397 (gonion contour proxy), 152 (menton) [Frontal 2D Proxy]
 */
export const LANDMARK_INDICES = {
  leftEyeLateral: 33,
  leftEyeMedial: 133,
  rightEyeMedial: 362,
  rightEyeLateral: 263,
  leftEyeLowerLid: 145,
  rightEyeLowerLid: 374,
  leftIrisCenter: 468,
  leftIrisContour: [469, 470, 471, 472],
  rightIrisCenter: 473,
  rightIrisContour: [474, 475, 476, 477],
  foreheadTopProxy: 10,
  glabella: 9,
  nasion: 168,
  noseTip: 1,
  subnasale: 2,
  menton: 152,
  leftJawUpper: 127,
  leftGonionProxy: 172,
  rightJawUpper: 356,
  rightGonionProxy: 397,
  symmetryPairs: {
    eyes: [
      [33, 263],
      [133, 362],
      [159, 386],
      [145, 374]
    ] as [number, number][],
    brows: [
      [70, 300],
      [105, 334],
      [107, 336]
    ] as [number, number][],
    nose: [
      [98, 327],
      [49, 279]
    ] as [number, number][],
    mouth: [
      [61, 291],
      [40, 270],
      [88, 318]
    ] as [number, number][],
    jaw: [
      [172, 397],
      [136, 365],
      [150, 379]
    ] as [number, number][]
  }
} as const;

export function dist2D(a: Point3D, b: Point3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Scales normalized landmarks by image aspect dimensions and rotates the entire set
 * around the midpoint between the two iris centers so the interpupillary line is horizontal (roll = 0).
 */
export function normalizeAndDerollLandmarks(
  rawLandmarks: Point3D[],
  imageWidth = 1,
  imageHeight = 1
): {
  landmarks: Point3D[];
  rollDegrees: number;
  ipd: number;
  irisDiameterPx: number;
} {
  if (rawLandmarks.length < 478) {
    throw new Error(`Expected 478 landmarks from MediaPipe Face Landmarker, received ${rawLandmarks.length}`);
  }

  const scaled = rawLandmarks.map((pt) => ({
    x: pt.x * imageWidth,
    y: pt.y * imageHeight,
    z: pt.z * imageWidth
  }));

  const leftPupil = scaled[LANDMARK_INDICES.leftIrisCenter];
  const rightPupil = scaled[LANDMARK_INDICES.rightIrisCenter];

  const centerX = (leftPupil.x + rightPupil.x) / 2;
  const centerY = (leftPupil.y + rightPupil.y) / 2;

  const rollRad = Math.atan2(rightPupil.y - leftPupil.y, rightPupil.x - leftPupil.x);
  const rollDegrees = (rollRad * 180) / Math.PI;

  const cos = Math.cos(-rollRad);
  const sin = Math.sin(-rollRad);

  const rotated = scaled.map((pt) => {
    const dx = pt.x - centerX;
    const dy = pt.y - centerY;
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
      z: pt.z
    };
  });

  const ipd = dist2D(
    rotated[LANDMARK_INDICES.leftIrisCenter],
    rotated[LANDMARK_INDICES.rightIrisCenter]
  );

  // Compute mean horizontal iris diameter across both eyes
  const leftIrisWidth = Math.max(
    dist2D(rotated[469], rotated[471]),
    dist2D(rotated[470], rotated[472])
  );
  const rightIrisWidth = Math.max(
    dist2D(rotated[474], rotated[476]),
    dist2D(rotated[475], rotated[477])
  );
  const irisDiameterPx = (leftIrisWidth + rightIrisWidth) / 2 || ipd * 0.185;

  return {
    landmarks: rotated,
    rollDegrees,
    ipd: Math.max(ipd, 1e-6),
    irisDiameterPx: Math.max(irisDiameterPx, 1e-6)
  };
}

export interface ComputeMetricsOptions {
  imageWidth?: number;
  imageHeight?: number;
  hairlineConfirmed?: boolean;
  customHairlineYNormalized?: number;
}

/**
 * Pure function computing all facial metrics from a single 478-landmark frame.
 */
export function computeFrameMetrics(
  rawLandmarks: Point3D[],
  options: ComputeMetricsOptions = {}
): MetricsMap {
  const {
    imageWidth = 1,
    imageHeight = 1,
    hairlineConfirmed = false,
    customHairlineYNormalized
  } = options;

  const { landmarks, ipd, irisDiameterPx } = normalizeAndDerollLandmarks(
    rawLandmarks,
    imageWidth,
    imageHeight
  );

  // 1. Intercanthal Ratio: medial-to-medial distance / mean single palpebral fissure width
  const leftLat = landmarks[LANDMARK_INDICES.leftEyeLateral];
  const leftMed = landmarks[LANDMARK_INDICES.leftEyeMedial];
  const rightMed = landmarks[LANDMARK_INDICES.rightEyeMedial];
  const rightLat = landmarks[LANDMARK_INDICES.rightEyeLateral];

  const intercanthalDist = dist2D(leftMed, rightMed);
  const leftFissure = dist2D(leftLat, leftMed);
  const rightFissure = dist2D(rightLat, rightMed);
  const meanFissure = (leftFissure + rightFissure) / 2;
  const intercanthalRatio = intercanthalDist / Math.max(meanFissure, 1e-6);

  // 2. Canthal Tilt: angle of medial-to-lateral canthus against horizontal after roll correction
  // In screen coordinates, Y increases downward, so upward lateral tilt means lateral.y < medial.y -> (medial.y - lateral.y) > 0
  const leftTiltDeg =
    (Math.atan2(leftMed.y - leftLat.y, Math.abs(leftLat.x - leftMed.x)) * 180) / Math.PI;
  const rightTiltDeg =
    (Math.atan2(rightMed.y - rightLat.y, Math.abs(rightLat.x - rightMed.x)) * 180) / Math.PI;
  const meanTiltDeg = (leftTiltDeg + rightTiltDeg) / 2;

  // 3. Facial Symmetry: midline defined by best-fit line through glabella (9), subnasale (2), menton (152)
  const glabella = landmarks[LANDMARK_INDICES.glabella];
  const subnasale = landmarks[LANDMARK_INDICES.subnasale];
  const menton = landmarks[LANDMARK_INDICES.menton];

  // Fit line x = m * y + c through midline landmarks
  const midlinePts = [glabella, subnasale, menton];
  const meanY = midlinePts.reduce((acc, p) => acc + p.y, 0) / midlinePts.length;
  const meanX = midlinePts.reduce((acc, p) => acc + p.x, 0) / midlinePts.length;
  const denom = midlinePts.reduce((acc, p) => acc + (p.y - meanY) ** 2, 0);
  const slopeXPerY =
    denom > 1e-9
      ? midlinePts.reduce((acc, p) => acc + (p.y - meanY) * (p.x - meanX), 0) / denom
      : 0;

  const midlineXAtY = (y: number) => meanX + slopeXPerY * (y - meanY);

  const computeRegionSymmetry = (pairs: [number, number][]): number => {
    let sumDev = 0;
    for (const [lIdx, rIdx] of pairs) {
      const lPt = landmarks[lIdx];
      const rPt = landmarks[rIdx];
      const pairMidY = (lPt.y + rPt.y) / 2;
      const midX = midlineXAtY(pairMidY);
      const leftDist = Math.abs(midX - lPt.x);
      const rightDist = Math.abs(rPt.x - midX);
      const horizDiff = Math.abs(leftDist - rightDist);
      const vertDiff = Math.abs(lPt.y - rPt.y);
      sumDev += Math.hypot(horizDiff, vertDiff) / ipd;
    }
    return (sumDev / pairs.length) * 100; // expressed as % of IPD
  };

  const symEyes = computeRegionSymmetry(LANDMARK_INDICES.symmetryPairs.eyes);
  const symBrows = computeRegionSymmetry(LANDMARK_INDICES.symmetryPairs.brows);
  const symNose = computeRegionSymmetry(LANDMARK_INDICES.symmetryPairs.nose);
  const symMouth = computeRegionSymmetry(LANDMARK_INDICES.symmetryPairs.mouth);
  const symJaw = computeRegionSymmetry(LANDMARK_INDICES.symmetryPairs.jaw);
  const symOverall = (symEyes + symBrows + symNose + symMouth + symJaw) / 5;

  // 4. Facial Thirds: hairline-to-brow (glabella), brow-to-subnasale, subnasale-to-menton
  let hairlineY = landmarks[LANDMARK_INDICES.foreheadTopProxy].y;
  if (typeof customHairlineYNormalized === 'number') {
    const leftPupilRawY = rawLandmarks[LANDMARK_INDICES.leftIrisCenter].y * imageHeight;
    const rightPupilRawY = rawLandmarks[LANDMARK_INDICES.rightIrisCenter].y * imageHeight;
    const pupilCenterY = (leftPupilRawY + rightPupilRawY) / 2;
    hairlineY = customHairlineYNormalized * imageHeight - pupilCenterY;
  }

  const upperLen = Math.max(0, glabella.y - hairlineY);
  const middleLen = Math.max(0, subnasale.y - glabella.y);
  const lowerLen = Math.max(0, menton.y - subnasale.y);
  const totalFaceHeight = Math.max(upperLen + middleLen + lowerLen, 1e-6);

  const upperPct = (upperLen / totalFaceHeight) * 100;
  const middlePct = (middleLen / totalFaceHeight) * 100;
  const lowerPct = (lowerLen / totalFaceHeight) * 100;

  // 5. Lower Eyelid to Iris Gap ("scleral show (approximate)")
  // Vertical gap between lower iris border (max Y of iris contour 468..472 and 473..477) and lower lid margin (145, 374)
  const leftIrisBottomY = Math.max(
    landmarks[468].y,
    ...LANDMARK_INDICES.leftIrisContour.map((i) => landmarks[i].y)
  );
  const rightIrisBottomY = Math.max(
    landmarks[473].y,
    ...LANDMARK_INDICES.rightIrisContour.map((i) => landmarks[i].y)
  );
  const leftLowerLidY = landmarks[LANDMARK_INDICES.leftEyeLowerLid].y;
  const rightLowerLidY = landmarks[LANDMARK_INDICES.rightEyeLowerLid].y;

  const leftGapRatio = Math.max(0, (leftLowerLidY - leftIrisBottomY) / irisDiameterPx);
  const rightGapRatio = Math.max(0, (rightLowerLidY - rightIrisBottomY) / irisDiameterPx);
  const meanScleralShow = (leftGapRatio + rightGapRatio) / 2;

  // 6. Jaw Angle (Frontal 2D Proxy)
  const computeInteriorAngleDeg = (a: Point3D, vertex: Point3D, c: Point3D): number => {
    const v1x = a.x - vertex.x;
    const v1y = a.y - vertex.y;
    const v2x = c.x - vertex.x;
    const v2y = c.y - vertex.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (mag < 1e-9) return 125;
    const cosTheta = Math.max(-1, Math.min(1, dot / mag));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  };

  const leftJawAngle = computeInteriorAngleDeg(
    landmarks[LANDMARK_INDICES.leftJawUpper],
    landmarks[LANDMARK_INDICES.leftGonionProxy],
    menton
  );
  const rightJawAngle = computeInteriorAngleDeg(
    landmarks[LANDMARK_INDICES.rightJawUpper],
    landmarks[LANDMARK_INDICES.rightGonionProxy],
    menton
  );
  const jawAngleProxy = (leftJawAngle + rightJawAngle) / 2;

  return {
    intercanthalRatio: {
      key: 'intercanthalRatio',
      label: 'Intercanthal Ratio',
      value: Number(intercanthalRatio.toFixed(3)),
      unit: 'ratio',
      iqr: 0.03,
      confidence: 'good',
      notes: 'Medial canthal distance (133–362) divided by mean palpebral fissure width.'
    },
    canthalTiltLeft: {
      key: 'canthalTiltLeft',
      label: 'Canthal Tilt (Photo-Left Eye)',
      value: Number(leftTiltDeg.toFixed(2)),
      unit: 'deg',
      iqr: 1.5,
      confidence: 'moderate',
      notes: 'Roll-corrected angle from medial (133) to lateral (33) canthus. Expect ~1–2° noise.'
    },
    canthalTiltRight: {
      key: 'canthalTiltRight',
      label: 'Canthal Tilt (Photo-Right Eye)',
      value: Number(rightTiltDeg.toFixed(2)),
      unit: 'deg',
      iqr: 1.5,
      confidence: 'moderate',
      notes: 'Roll-corrected angle from medial (362) to lateral (263) canthus. Expect ~1–2° noise.'
    },
    canthalTiltMean: {
      key: 'canthalTiltMean',
      label: 'Mean Canthal Tilt',
      value: Number(meanTiltDeg.toFixed(2)),
      unit: 'deg',
      iqr: 1.5,
      confidence: 'moderate',
      notes: 'Average tilt of both eyes after interpupillary roll correction.'
    },
    symmetryOverall: {
      key: 'symmetryOverall',
      label: 'Facial Symmetry Deviation',
      value: Number(symOverall.toFixed(2)),
      unit: '% IPD',
      iqr: 0.6,
      confidence: 'moderate',
      notes: 'Mean bilateral deviation across eyes, brows, nose, mouth, and jaw normalized by IPD.',
      subValues: {
        eyes: Number(symEyes.toFixed(2)),
        brows: Number(symBrows.toFixed(2)),
        nose: Number(symNose.toFixed(2)),
        mouth: Number(symMouth.toFixed(2)),
        jaw: Number(symJaw.toFixed(2))
      }
    },
    upperThird: {
      key: 'upperThird',
      label: 'Upper Facial Third',
      value: Number(upperPct.toFixed(1)),
      unit: '%',
      iqr: hairlineConfirmed ? 1.2 : 3.0,
      confidence: hairlineConfirmed ? 'moderate' : 'low',
      notes: hairlineConfirmed
        ? 'Hairline (user-confirmed) to glabella (9) as share of total vertical height.'
        : 'Uses mesh top point (10) as unconfirmed hairline proxy. Confirm hairline point to improve reliability.'
    },
    middleThird: {
      key: 'middleThird',
      label: 'Middle Facial Third',
      value: Number(middlePct.toFixed(1)),
      unit: '%',
      iqr: hairlineConfirmed ? 1.0 : 2.5,
      confidence: hairlineConfirmed ? 'moderate' : 'low',
      notes: 'Glabella (9) to subnasale (2) proportion.'
    },
    lowerThird: {
      key: 'lowerThird',
      label: 'Lower Facial Third',
      value: Number(lowerPct.toFixed(1)),
      unit: '%',
      iqr: hairlineConfirmed ? 1.0 : 2.5,
      confidence: hairlineConfirmed ? 'moderate' : 'low',
      notes: 'Subnasale (2) to menton (152) proportion.'
    },
    scleralShow: {
      key: 'scleralShow',
      label: 'Scleral Show (Approximate)',
      value: Number(meanScleralShow.toFixed(3)),
      unit: 'iris ratio',
      iqr: 0.025,
      confidence: 'low',
      notes: 'Vertical gap between lower iris border and lower eyelid margin as a fraction of iris diameter.'
    },
    jawAngleProxy: {
      key: 'jawAngleProxy',
      label: 'Jaw Angle (Frontal Proxy)',
      value: Number(jawAngleProxy.toFixed(1)),
      unit: 'deg',
      iqr: 3.5,
      confidence: 'low',
      notes: 'Frontal-view 2D contour proxy (127–172–152 / 356–397–152). A true gonial angle requires a lateral profile photograph.'
    }
  };
}

function medianAndIqr(values: number[]): { median: number; iqr: number } {
  if (values.length === 0) return { median: 0, iqr: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (q: number) => {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };
  const med = quantile(0.5);
  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  return { median: med, iqr: Math.max(0.01, q3 - q1) };
}

/**
 * Aggregates ~30 multi-frame metric snapshots using the per-metric median and interquartile range (IQR).
 */
export function aggregateMultiFrameMetrics(frames: MetricsMap[]): MetricsMap {
  if (frames.length === 0) {
    throw new Error('Cannot aggregate empty frames array');
  }
  if (frames.length === 1) {
    return frames[0];
  }

  const keys = Object.keys(frames[0]) as MetricKey[];
  const result = {} as MetricsMap;

  for (const key of keys) {
    const sample = frames[0][key];
    const series = frames.map((f) => f[key].value);
    const { median, iqr } = medianAndIqr(series);

    let subValues: Record<string, number> | undefined;
    if (sample.subValues) {
      subValues = {};
      for (const subKey of Object.keys(sample.subValues)) {
        const subSeries = frames.map((f) => f[key].subValues?.[subKey] ?? 0);
        subValues[subKey] = Number(medianAndIqr(subSeries).median.toFixed(2));
      }
    }

    result[key] = {
      ...sample,
      value: Number(median.toFixed(sample.unit === 'ratio' || sample.unit === 'iris ratio' ? 3 : 2)),
      iqr: Number(iqr.toFixed(sample.unit === 'ratio' || sample.unit === 'iris ratio' ? 3 : 2)),
      subValues
    };
  }

  return result;
}
