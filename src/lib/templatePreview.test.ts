import { describe, expect, test } from "vitest";
import { isRemoteImageUrl } from "./templatePreview";

describe("templatePreview logo URL handling", () => {
  test("treats http(s) URLs as remote images", () => {
    expect(isRemoteImageUrl("https://example.com/logo.png")).toBe(true);
    expect(isRemoteImageUrl("http://localhost:54321/storage/v1/object/public/user-logos/x.png")).toBe(true);
  });

  test("does not treat data/blob/relative URLs as remote", () => {
    expect(isRemoteImageUrl("data:image/png;base64,abc")).toBe(false);
    expect(isRemoteImageUrl("blob:http://localhost:5173/abc-def")).toBe(false);
    expect(isRemoteImageUrl("/assets/logo.png")).toBe(false);
    expect(isRemoteImageUrl("assets/logo.png")).toBe(false);
  });
});
