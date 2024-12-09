export function requireEnv<T extends Record<string, string>>(
  config: T
): { [K in keyof T]: string } {
  const missingValues = Object.values(config).filter(
    (key) => !(key in process.env) || !process.env[key]
  );
  if (missingValues.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingValues.join(", ")}`
    );
  }

  const result = {} as { [K in keyof T]: string };

  for (const key in config) {
    result[key] = process.env[config[key]]!;
  }

  return result;
}
