const SPEED_OF_LIGHT_M_PER_S = 299_792_458;
const COPPER_CONDUCTIVITY_S_PER_M = 5.8e7;

export type MicrostripInput = {
  traceWidthM: number;
  substrateHeightM: number;
  traceLengthM: number;
  conductorThicknessM: number;
  relativePermittivity: number;
  lossTangent: number;
  conductorConductivitySPerM: number;
  frequencyHz: number;
};

export type MicrostripResult = {
  effectiveRelativePermittivity: number;
  characteristicImpedanceOhms: number;
  zeroThicknessCharacteristicImpedanceOhms: number;
  finiteThickness: {
    effectiveTraceWidthM: number;
    deltaWidthM: number;
    characteristicImpedanceOhms: number;
    deltaFromZeroThicknessOhms: number;
    percentDeltaFromZeroThickness: number;
    assumption: string;
  };
  phaseVelocityMPerS: number;
  wavelengthM: number;
  electricalLengthRad: number;
  propagationDelayS: number;
  estimatedLossDb: number;
  widthToHeightRatio: number;
};

export function calculateEffectiveRelativePermittivity(input: {
  traceWidthM: number;
  substrateHeightM: number;
  relativePermittivity: number;
}): number {
  const { traceWidthM, substrateHeightM, relativePermittivity } = input;
  validatePositive("traceWidthM", traceWidthM);
  validatePositive("substrateHeightM", substrateHeightM);
  validateRelativePermittivity(relativePermittivity);

  const wh = traceWidthM / substrateHeightM;

  // Hammerstad-Jensen style quasi-static effective permittivity approximation.
  // Assumes a single microstrip over an infinite ground plane, non-magnetic substrate,
  // and ignores high-frequency dispersion. TODO: add finite thickness and dispersion correction.
  return (
    (relativePermittivity + 1) / 2 +
    ((relativePermittivity - 1) / 2) * (1 / Math.sqrt(1 + 12 / wh) + (wh < 1 ? 0.04 * (1 - wh) ** 2 : 0))
  );
}

export function calculateMicrostrip(input: MicrostripInput): MicrostripResult {
  validateMicrostripInput(input);

  const effectiveRelativePermittivity = calculateEffectiveRelativePermittivity(input);
  const widthToHeightRatio = input.traceWidthM / input.substrateHeightM;

  // Wheeler/Hammerstad closed-form impedance approximation for zero-thickness microstrip.
  // Good enough for initial textbook validation, typically within a few percent for common PCB geometries.
  const characteristicImpedanceOhms = calculateZeroThicknessImpedance({
    widthToHeightRatio,
    effectiveRelativePermittivity
  });
  const finiteThickness = calculateFiniteThicknessCorrection({
    input,
    effectiveRelativePermittivity,
    zeroThicknessCharacteristicImpedanceOhms: characteristicImpedanceOhms
  });

  const phaseVelocityMPerS = SPEED_OF_LIGHT_M_PER_S / Math.sqrt(effectiveRelativePermittivity);
  const wavelengthM = phaseVelocityMPerS / input.frequencyHz;
  const electricalLengthRad = (2 * Math.PI * input.traceLengthM) / wavelengthM;
  const propagationDelayS = input.traceLengthM / phaseVelocityMPerS;
  const estimatedLossDb = estimateLossDb({
    input,
    characteristicImpedanceOhms,
    effectiveRelativePermittivity
  });

  return {
    effectiveRelativePermittivity,
    characteristicImpedanceOhms,
    zeroThicknessCharacteristicImpedanceOhms: characteristicImpedanceOhms,
    finiteThickness,
    phaseVelocityMPerS,
    wavelengthM,
    electricalLengthRad,
    propagationDelayS,
    estimatedLossDb,
    widthToHeightRatio
  };
}

export const calculateMicrostripImpedance = calculateMicrostrip;

export function calculateFiniteThicknessEffectiveWidth(input: {
  traceWidthM: number;
  substrateHeightM: number;
  conductorThicknessM: number;
}): { effectiveTraceWidthM: number; deltaWidthM: number } {
  validatePositive("traceWidthM", input.traceWidthM);
  validatePositive("substrateHeightM", input.substrateHeightM);
  validatePositive("conductorThicknessM", input.conductorThicknessM);

  // First-order Hammerstad-style finite conductor thickness correction.
  // Treats finite copper thickness as a small increase in effective strip width.
  // This is a quasi-static engineering correction, not a substitute for field solving.
  // TODO: add the er-dependent Hammerstad correction branch and compare against IPC calculators.
  const cappedThicknessM = Math.min(input.conductorThicknessM, input.substrateHeightM);
  const logArgument = Math.max((4 * Math.PI * input.traceWidthM) / cappedThicknessM, Math.E);
  const deltaWidthM = (cappedThicknessM / Math.PI) * (1 + Math.log(logArgument));

  return {
    effectiveTraceWidthM: input.traceWidthM + deltaWidthM,
    deltaWidthM
  };
}

export function estimateLossDb({
  input,
  characteristicImpedanceOhms,
  effectiveRelativePermittivity
}: {
  input: MicrostripInput;
  characteristicImpedanceOhms: number;
  effectiveRelativePermittivity: number;
}): number {
  const dielectricLossNpPerM =
    (Math.PI *
      input.frequencyHz *
      Math.sqrt(effectiveRelativePermittivity) *
      (input.relativePermittivity - 1) *
      input.lossTangent) /
    (SPEED_OF_LIGHT_M_PER_S *
      Math.sqrt(input.relativePermittivity) *
      (effectiveRelativePermittivity - 1));

  const conductivity = input.conductorConductivitySPerM || COPPER_CONDUCTIVITY_S_PER_M;
  const surfaceResistanceOhms = Math.sqrt((Math.PI * input.frequencyHz * 4 * Math.PI * 1e-7) / conductivity);
  const conductorLossNpPerM = surfaceResistanceOhms / (2 * characteristicImpedanceOhms * Math.max(input.traceWidthM, 1e-12));

  return 8.686 * (dielectricLossNpPerM + conductorLossNpPerM) * input.traceLengthM;
}

function calculateFiniteThicknessCorrection({
  input,
  effectiveRelativePermittivity,
  zeroThicknessCharacteristicImpedanceOhms
}: {
  input: MicrostripInput;
  effectiveRelativePermittivity: number;
  zeroThicknessCharacteristicImpedanceOhms: number;
}): MicrostripResult["finiteThickness"] {
  const { effectiveTraceWidthM, deltaWidthM } = calculateFiniteThicknessEffectiveWidth(input);
  const characteristicImpedanceOhms = calculateZeroThicknessImpedance({
    widthToHeightRatio: effectiveTraceWidthM / input.substrateHeightM,
    effectiveRelativePermittivity
  });
  const deltaFromZeroThicknessOhms = characteristicImpedanceOhms - zeroThicknessCharacteristicImpedanceOhms;

  return {
    effectiveTraceWidthM,
    deltaWidthM,
    characteristicImpedanceOhms,
    deltaFromZeroThicknessOhms,
    percentDeltaFromZeroThickness: (deltaFromZeroThicknessOhms / zeroThicknessCharacteristicImpedanceOhms) * 100,
    assumption: "finite conductor thickness approximated as increased effective strip width"
  };
}

function calculateZeroThicknessImpedance({
  widthToHeightRatio,
  effectiveRelativePermittivity
}: {
  widthToHeightRatio: number;
  effectiveRelativePermittivity: number;
}): number {
  return widthToHeightRatio <= 1
    ? (60 / Math.sqrt(effectiveRelativePermittivity)) * Math.log(8 / widthToHeightRatio + widthToHeightRatio / 4)
    : (120 * Math.PI) /
      (Math.sqrt(effectiveRelativePermittivity) *
        (widthToHeightRatio + 1.393 + 0.667 * Math.log(widthToHeightRatio + 1.444)));
}

function validateMicrostripInput(input: MicrostripInput) {
  validatePositive("traceWidthM", input.traceWidthM);
  validatePositive("substrateHeightM", input.substrateHeightM);
  validatePositive("traceLengthM", input.traceLengthM);
  validatePositive("conductorThicknessM", input.conductorThicknessM);
  validatePositive("frequencyHz", input.frequencyHz);
  validateRelativePermittivity(input.relativePermittivity);
  if (input.lossTangent < 0) throw new Error("lossTangent must be non-negative.");
  if (input.conductorConductivitySPerM <= 0) throw new Error("conductorConductivitySPerM must be positive.");
}

function validatePositive(label: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }
}

function validateRelativePermittivity(value: number) {
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("relativePermittivity must be greater than or equal to 1.");
  }
}
