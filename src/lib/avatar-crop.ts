export interface CropArea { x: number; y: number; width: number; height: number }

/** Saves the selected square itself so every screen uses the same framing. */
export async function cropAvatar(source: string, area: CropArea, banner = false): Promise<File> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = banner ? 1500 : 512;
  canvas.height = banner ? 500 : 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não consegui preparar a foto.");
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Não consegui recortar a foto.")), "image/jpeg", 0.92);
  });
  return new File([blob], banner ? "banner.jpg" : "avatar.jpg", { type: "image/jpeg" });
}