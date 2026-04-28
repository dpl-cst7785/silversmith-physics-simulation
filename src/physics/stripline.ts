const SPEED_OF_LIGHT_M_PER_S = 299_792_458;

export type StriplineInput = {
  traceWidthM: number;
  dielectricHeightM: number;
  traceLengthM: number;
  conductorThicknessM: number;
  relativePermittivity: number;
  lossTangent: number;
  conductorConductivitySPerM: number;
  frequencyHz: number;
};

export type StriplineResult = {
  effectiveRelativePermittivity: number;
  characteristicImpedanceOhms: number;
  phaseVelocityMPerS: number;
  wavelengthM: number;
  electricalLengthRad: number;
  propagationDelayS: number;
  estimatedLossDb: number;
  widthToHeightRatio: number;
};

export function calculateStripline(input: StriplineInput): StriplineResult {
  validateStriplineInput(input);

  const widthToHeightRatio = input.traceWidthM / input.dielectricHeightM;
  const effectiveRelativePermittivity = input.relativePermittivity;

  // Symmetric stripline, homogeneous dielectric, TEM approximation.
  // b is the ground-plane separation and w is strip width. The expression
  // Z0 = 30*pi / (sqrt(er) * (w / b + 0.441)) is a common closed-form
  // textbook approximation for moderate strip widths. TODO: add Wheeler
  // narrow/wide piecewise correction and finite conductor thickness.
  const characteristicImpedanceOhms =
    (30 * Math.PI) / (Math.sqrt(input.relativePermittivity) * (widthToHeightRatio + 0.441));

  const phaseVelocityMPerS = SPEED_OF_LIGHT_M_PER_S / Math.sqrt(effectiveRelativePermittivity);
  const wavelengthM = phaseVelocityMPerS / input.frequencyHz;
  const electricalLengthRad = (2 * Math.PI * input.traceLengthM) / wavelengthM;
  const propagationDelayS = input.traceLengthM / phaseVelocityMPerS;

  return {
    effectiveRelativePermittivity,
    characteristicImpedanceOhms,
    phaseVelocityMPerS,
    wavelengthM,
    electricalLengthRad,
    propagationDelayS,
    estimatedLossDb: estimateStriplineLossDb(input, characteristicImpedanceOhms),
    widthToHeightRatio
  };
}

function estimateStriplineLossDb(input: StriplineInput, characteristicImpedanceOhms: number): number {
  const dielectricLossNpPerM =
    (Math.PI * input.frequencyHz * Math.sqrt(input.relativePermittivity) * input.lossTangent) / SPEED_OF_LIGHT_M_PER_S;
  const surfaceResistanceOhms = Math.sqrt((Math.PI * input.frequencyHz * 4 * Math.PI * 1e-7) / input.conductorConductivitySPerM);
  const conductorLossNpPerM = surfaceResistanceOhms / (characteristicImpedanceOhms * Math.max(input.traceWidthM, 1e-12));

  return 8.686 * (dielectricLossNpPerM + conductorLossNpPerM) * input.traceLengthM;
}

function validateStriplineInput(input: StriplineInput) {
  validatePositive("traceWidthM", input.traceWidthM);
  validatePositive("dielectricHeightM", input.dielectricHeightM);
  validatePositive("traceLengthM", input.traceLengthM);
  validatePositive("conductorThicknessM", input.conductorThicknessM);
  validatePositive("frequencyHz", input.frequencyHz);
  validatePositive("conductorConductivitySPerM", input.conductorConductivitySPerM);
  if (!Number.isFinite(input.relativePermittivity) || input.relativePermittivity < 1) {
    throw new Error("relativePermittivity must be greater than or equal to 1.");
  }
  if (!Number.isFinite(input.lossTangent) || input.lossTangent < 0) {
    throw new Error("lossTangent must be non-negative.");
  }
}

function validatePositive(label: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }
}
