import { requireEnv } from "./utils";

describe("requireEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return the environment variables when they are set", () => {
    process.env.TEST_VAR = "test_value";
    const config = { testVar: "TEST_VAR" };
    const result = requireEnv(config);
    expect(result).toEqual({ testVar: "test_value" });
  });

  it("should throw an error when required environment variables are missing", () => {
    const config = { missingVar: "MISSING_VAR" };
    expect(() => requireEnv(config)).toThrow(
      "Missing required environment variables: MISSING_VAR"
    );
  });
});
