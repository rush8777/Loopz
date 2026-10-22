import { ONSITE_LIMITS, onsiteImageSourceIsSafe } from "../onsite/OnsiteDocument";

/** Local raster input is re-encoded and bounded before it enters the document. */
export async function prepareImageFile(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { image.onload = image.onerror = null; reject(new Error("Image took too long to open. Try another file.")); }, 15_000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error("This image could not be opened. Try another PNG, JPG or WebP file.")); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("This image is too large. Choose an image under 40 megapixels.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d"); if (!context) throw new Error("This browser could not prepare the image.");
    let scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL("image/webp", Math.max(.45, .85 - attempt * .08));
      if (src.length <= ONSITE_LIMITS.maxInlineImage && onsiteImageSourceIsSafe(src)) return src;
      scale *= .8;
    }
    throw new Error("This image is too detailed to save. Try a smaller image or use an image URL.");
  } finally { image.onload = image.onerror = null; URL.revokeObjectURL(url); }
}
