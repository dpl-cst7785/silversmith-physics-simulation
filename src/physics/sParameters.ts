export type Complex = {
  real: number;
  imaginary: number;
};

export type TouchstoneParameter = {
  frequencyHz: number;
  values: Complex[];
};

export type TouchstoneData = {
  ports: 1 | 2;
  frequencyUnit: "hz" | "khz" | "mhz" | "ghz";
  parameter: "s" | "y" | "z" | "h" | "g";
  format: "ri" | "ma" | "db";
  referenceOhms: number;
  rows: TouchstoneParameter[];
};

export type SParameterMetrics = {
  s11Db: number;
  s21Db: number | null;
  returnLossDb: number;
  insertionLossDb: number | null;
  vswr: number;
  inputImpedance: Complex;
};

const frequencyScales: Record<TouchstoneData["frequencyUnit"], number> = {
  hz: 1,
  khz: 1e3,
  mhz: 1e6,
  ghz: 1e9
};

export function inferTouchstonePorts(fileName: string): 1 | 2 {
  const match = fileName.toLowerCase().match(/\.s(\d+)p$/);
  if (!match) {
    throw new Error("Touchstone file name must end with .s1p or .s2p.");
  }

  const ports = Number(match[1]);
  if (ports !== 1 && ports !== 2) {
    throw new Error("Only .s1p and .s2p files are supported in this MVP.");
  }

  return ports;
}

export function parseTouchstone(content: string, fileName = "upload.s2p"): TouchstoneData {
  const ports = inferTouchstonePorts(fileName);
  const tokens: number[] = [];
  let frequencyUnit: TouchstoneData["frequencyUnit"] = "ghz";
  let parameter: TouchstoneData["parameter"] = "s";
  let format: TouchstoneData["format"] = "ma";
  let referenceOhms = 50;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split("!")[0].trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      const parts = line.slice(1).trim().toLowerCase().split(/\s+/);
      frequencyUnit = readOption(parts, ["hz", "khz", "mhz", "ghz"], frequencyUnit);
      parameter = readOption(parts, ["s", "y", "z", "h", "g"], parameter);
      format = readOption(parts, ["ri", "ma", "db"], format);
      const rIndex = parts.indexOf("r");
      if (rIndex >= 0 && parts[rIndex + 1]) {
        referenceOhms = Number(parts[rIndex + 1]);
      }
      continue;
    }

    tokens.push(...line.split(/\s+/).map(Number));
  }

  const valuesPerRow = 1 + ports * ports * 2;
  if (tokens.length % valuesPerRow !== 0) {
    throw new Error(`Touchstone data has ${tokens.length} values, which does not match ${ports} port rows.`);
  }

  const rows: TouchstoneParameter[] = [];
  for (let i = 0; i < tokens.length; i += valuesPerRow) {
    const frequencyHz = tokens[i] * frequencyScales[frequencyUnit];
    const values: Complex[] = [];
    for (let j = i + 1; j < i + valuesPerRow; j += 2) {
      values.push(toComplex(tokens[j], tokens[j + 1], format));
    }
    rows.push({ frequencyHz, values });
  }

  return { ports, frequencyUnit, parameter, format, referenceOhms, rows };
}

export function complexMagnitude(value: Complex): number {
  return Math.hypot(value.real, value.imaginary);
}

export function magnitudeDb(value: Complex): number {
  return 20 * Math.log10(Math.max(complexMagnitude(value), Number.EPSILON));
}

export function returnLossDb(s11: Complex): number {
  return -magnitudeDb(s11);
}

export function insertionLossDb(s21: Complex): number {
  return -magnitudeDb(s21);
}

export function vswrFromReflection(value: Complex): number {
  const gamma = Math.min(complexMagnitude(value), 0.999999);
  return (1 + gamma) / (1 - gamma);
}

export function reflectionCoefficientFromImpedance(loadOhms: number, referenceOhms: number): Complex {
  return {
    real: (loadOhms - referenceOhms) / (loadOhms + referenceOhms),
    imaginary: 0
  };
}

export function impedanceFromReflection(s11: Complex, referenceOhms: number): Complex {
  const numerator = complexMultiply({ real: referenceOhms, imaginary: 0 }, complexAdd({ real: 1, imaginary: 0 }, s11));
  const denominator = complexSubtract({ real: 1, imaginary: 0 }, s11);
  return complexDivide(numerator, denominator);
}

export function sParameterAtFrequency(data: TouchstoneData, frequencyHz: number, parameterIndex = 0): Complex | null {
  if (data.rows.length === 0) return null;
  const nearest = data.rows.reduce((best, row) =>
    Math.abs(row.frequencyHz - frequencyHz) < Math.abs(best.frequencyHz - frequencyHz) ? row : best
  );
  return nearest.values[parameterIndex] ?? null;
}

export function deriveSParameterMetrics({
  s11,
  s21,
  referenceOhms
}: {
  s11: Complex;
  s21?: Complex | null;
  referenceOhms: number;
}): SParameterMetrics {
  return {
    s11Db: magnitudeDb(s11),
    s21Db: s21 ? magnitudeDb(s21) : null,
    returnLossDb: returnLossDb(s11),
    insertionLossDb: s21 ? insertionLossDb(s21) : null,
    vswr: vswrFromReflection(s11),
    inputImpedance: impedanceFromReflection(s11, referenceOhms)
  };
}

function readOption<T extends string>(parts: string[], options: T[], fallback: T): T {
  const match = parts.find((part): part is T => options.includes(part as T));
  return match ?? fallback;
}

function toComplex(a: number, b: number, format: TouchstoneData["format"]): Complex {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error("Touchstone file contains a non-numeric value.");
  }

  if (format === "ri") {
    return { real: a, imaginary: b };
  }

  const magnitude = format === "db" ? 10 ** (a / 20) : a;
  const radians = (b * Math.PI) / 180;
  return {
    real: magnitude * Math.cos(radians),
    imaginary: magnitude * Math.sin(radians)
  };
}

function complexAdd(a: Complex, b: Complex): Complex {
  return { real: a.real + b.real, imaginary: a.imaginary + b.imaginary };
}

function complexSubtract(a: Complex, b: Complex): Complex {
  return { real: a.real - b.real, imaginary: a.imaginary - b.imaginary };
}

function complexMultiply(a: Complex, b: Complex): Complex {
  return {
    real: a.real * b.real - a.imaginary * b.imaginary,
    imaginary: a.real * b.imaginary + a.imaginary * b.real
  };
}

function complexDivide(a: Complex, b: Complex): Complex {
  const denominator = b.real ** 2 + b.imaginary ** 2;
  if (denominator === 0) throw new Error("Cannot divide by zero-valued complex number.");
  return {
    real: (a.real * b.real + a.imaginary * b.imaginary) / denominator,
    imaginary: (a.imaginary * b.real - a.real * b.imaginary) / denominator
  };
}
