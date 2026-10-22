import { describe, expect, it } from "vitest";
import { prepareImageFile } from "../src/experiences/editor/ImageFile";

describe("local image file input", () => {
  it("rejects unsupported and oversized files before attempting to decode them", async () => {
    await expect(prepareImageFile(new File(["<svg/>"], "drawing.svg", { type: "image/svg+xml" }))).rejects.toThrow("PNG, JPG or WebP");
    await expect(prepareImageFile({ type: "image/png", size: 11 * 1024 * 1024 } as File)).rejects.toThrow("10 MB");
  });
});
