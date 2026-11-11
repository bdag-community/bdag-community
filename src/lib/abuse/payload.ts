export function knownFormPayloadBytes(
  values: Readonly<Record<string, string>>,
): number {
  return Object.values(values).reduce(
    (total, value) => total + Buffer.byteLength(value, "utf8"),
    0,
  );
}

export function payloadFits(
  values: Readonly<Record<string, string>>,
  maximumBytes: number,
): boolean {
  return knownFormPayloadBytes(values) <= maximumBytes;
}
