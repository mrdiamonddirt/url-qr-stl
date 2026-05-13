import { describe, expect, test } from "vitest";
import { getQrTypeUnavailableReason, isPremiumQrType } from "./qr";

describe("qr capability rules", () => {
  test("marks micro and rmqr as available", () => {
    expect(getQrTypeUnavailableReason("micro")).toBeNull();
    expect(getQrTypeUnavailableReason("rmqr")).toBeNull();
  });

  test("keeps iqr and sqrc unavailable", () => {
    expect(getQrTypeUnavailableReason("iqr")).toMatch(/specialized encoder/i);
    expect(getQrTypeUnavailableReason("sqrc")).toMatch(/secure\/private/i);
  });

  test("treats advanced formats as premium", () => {
    expect(isPremiumQrType("standard")).toBe(false);
    expect(isPremiumQrType("frame")).toBe(true);
    expect(isPremiumQrType("micro")).toBe(true);
    expect(isPremiumQrType("rmqr")).toBe(true);
    expect(isPremiumQrType("iqr")).toBe(true);
    expect(isPremiumQrType("sqrc")).toBe(false);
  });
});
