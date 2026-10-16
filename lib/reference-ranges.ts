export type MetricKey =
  | 'intercanthalRatio'
  | 'canthalTiltLeft'
  | 'canthalTiltRight'
  | 'canthalTiltMean'
  | 'symmetryOverall'
  | 'upperThird'
  | 'middleThird'
  | 'lowerThird'
  | 'scleralShow'
  | 'jawAngleProxy';

export interface ReferenceRange {
  metric: MetricKey;
  label: string;
  unit: string;
  low: number;
  high: number;
  kind: 'anthropometric' | 'aesthetic-convention';
  source: string;
  proposedAnthropometric?: {
    low: number;
    high: number;
    sourceNote: string;
  };
}

/**
 * Seeded with the targets specified in Section 5 of the blueprint (marked
 * 'aesthetic-convention' with source: 'unsourced'), alongside proposed
 * published anthropometric replacements for the user to inspect and verify.
 */
export const DEFAULT_REFERENCE_RANGES: Record<MetricKey, ReferenceRange> = {
  intercanthalRatio: {
    metric: 'intercanthalRatio',
    label: 'Intercanthal to Palpebral Fissure Ratio',
    unit: 'ratio',
    low: 0.95,
    high: 1.05,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 0.98,
      high: 1.18,
      sourceNote:
        'Unverified by user — check Farkas LG (1994) Anthropometry of the Head and Face (en-en / ex-en norms across adult cohorts).'
    }
  },
  canthalTiltLeft: {
    metric: 'canthalTiltLeft',
    label: 'Canthal Tilt (Photo-Left / Subject Right Eye)',
    unit: 'deg',
    low: 2.0,
    high: 4.0,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 1.5,
      high: 8.5,
      sourceNote:
        'Unverified by user — check Farkas LG (1994) & Kunjur et al. (2006) palpebral fissure inclination norms.'
    }
  },
  canthalTiltRight: {
    metric: 'canthalTiltRight',
    label: 'Canthal Tilt (Photo-Right / Subject Left Eye)',
    unit: 'deg',
    low: 2.0,
    high: 4.0,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 1.5,
      high: 8.5,
      sourceNote:
        'Unverified by user — check Farkas LG (1994) & Kunjur et al. (2006) palpebral fissure inclination norms.'
    }
  },
  canthalTiltMean: {
    metric: 'canthalTiltMean',
    label: 'Mean Canthal Tilt',
    unit: 'deg',
    low: 2.0,
    high: 4.0,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 1.5,
      high: 8.5,
      sourceNote:
        'Unverified by user — check Farkas LG (1994) palpebral fissure inclination norms.'
    }
  },
  symmetryOverall: {
    metric: 'symmetryOverall',
    label: 'Bilateral Midline Deviation (% of IPD)',
    unit: '% IPD',
    low: 0.0,
    high: 2.5,
    kind: 'anthropometric',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 0.0,
      high: 3.0,
      sourceNote:
        'Unverified by user — check Farkas LG & Cheung G (1981) facial asymmetry prevalence in normal adults.'
    }
  },
  upperThird: {
    metric: 'upperThird',
    label: 'Upper Facial Third (Hairline to Glabella)',
    unit: '%',
    low: 30.0,
    high: 36.0,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 28.0,
      high: 38.0,
      sourceNote:
        'Unverified by user — check Farkas LG et al. (2005) International Anthropometric Study of Facial Morphology.'
    }
  },
  middleThird: {
    metric: 'middleThird',
    label: 'Middle Facial Third (Glabella to Subnasale)',
    unit: '%',
    low: 30.0,
    high: 36.0,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 29.0,
      high: 37.0,
      sourceNote:
        'Unverified by user — check Farkas LG et al. (2005) vertical facial proportions.'
    }
  },
  lowerThird: {
    metric: 'lowerThird',
    label: 'Lower Facial Third (Subnasale to Menton)',
    unit: '%',
    low: 30.0,
    high: 36.0,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 31.0,
      high: 39.0,
      sourceNote:
        'Unverified by user — check Farkas LG (1994) lower face height proportion norms.'
    }
  },
  scleralShow: {
    metric: 'scleralShow',
    label: 'Scleral Show (Approximate Lower Eyelid-to-Iris Gap)',
    unit: 'iris ratio',
    low: 0.0,
    high: 0.05,
    kind: 'anthropometric',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 0.0,
      high: 0.08,
      sourceNote:
        'Unverified by user — check clinical oculoplastic lower eyelid position relative to inferior limbus.'
    }
  },
  jawAngleProxy: {
    metric: 'jawAngleProxy',
    label: 'Frontal Jaw Contour Angle (Proxy)',
    unit: 'deg',
    low: 120.0,
    high: 126.0,
    kind: 'aesthetic-convention',
    source: 'unsourced',
    proposedAnthropometric: {
      low: 118.0,
      high: 132.0,
      sourceNote:
        'Unverified by user — check Jensen E et al. / Farkas LG lateral gonial angle norms (true measurement requires lateral profile).'
    }
  }
};
