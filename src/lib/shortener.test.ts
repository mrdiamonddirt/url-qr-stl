import { describe, expect, test } from "vitest";
import { shortUrlForCode } from "./shortener";

describe("shortUrlForCode", () => {
  test("keeps /s/:code as canonical path", () => {
    const code = "ABC1234";
    expect(shortUrlForCode(code)).toBe(`${window.location.origin}/s/${code}`);
  });
});