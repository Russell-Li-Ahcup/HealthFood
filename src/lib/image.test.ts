import { describe, expect, it } from "vitest";
import { dataUrlBytes, IMAGE_TARGET_BYTES, imageNeedsShrink } from "./image";

describe("dataUrlBytes", () => {
  it("counts decoded bytes of a base64 data URL", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(dataUrlBytes("data:image/jpeg;base64,AAA=")).toBe(2);
    expect(dataUrlBytes("data:image/jpeg;base64,AA==")).toBe(1);
  });
});

describe("imageNeedsShrink", () => {
  it("keeps small jpeg data URLs", () => {
    expect(imageNeedsShrink("data:image/jpeg;base64,AAAA")).toBe(false);
  });

  it("flags oversized jpeg data URLs", () => {
    const b64 = "A".repeat(Math.ceil((IMAGE_TARGET_BYTES + 8) * 4 / 3));
    expect(imageNeedsShrink(`data:image/jpeg;base64,${b64}`)).toBe(true);
  });

  it("ignores non-image strings", () => {
    expect(imageNeedsShrink("https://example.com/photo.jpg")).toBe(false);
  });
});
