import { BoxGeometry, Group, Mesh, MeshNormalMaterial } from "three";
import { StlParams } from "../types";
import { buildQrMatrix } from "./qr";

const DETAIL_SCALE: Record<StlParams["detail"], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

type GridMask = {
  width: number;
  height: number;
  data: boolean[];
};

function createModelGroupFromGrid(mask: GridMask, params: StlParams): Group {
  const detailScale = DETAIL_SCALE[params.detail];
  const moduleWidth = params.widthMm / mask.width;
  const moduleHeight = params.heightMm / mask.height;
  const raisedDepth = Math.max(0.4, params.depthMm * detailScale * 0.7);
  const group = new Group();

  if (params.baseMm > 0) {
    const base = new Mesh(
      new BoxGeometry(params.widthMm, params.heightMm, params.baseMm),
      new MeshNormalMaterial()
    );
    base.position.set(0, 0, params.baseMm / 2);
    group.add(base);
  }

  const moduleDepth = raisedDepth;
  const zOffset = params.baseMm + moduleDepth / 2;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const idx = y * mask.width + x;
      const isDark = mask.data[idx];
      const shouldRaise = params.invert ? !isDark : isDark;

      if (!shouldRaise) {
        continue;
      }

      const module = new Mesh(
        new BoxGeometry(moduleWidth, moduleHeight, moduleDepth),
        new MeshNormalMaterial()
      );

      const xPos = -params.widthMm / 2 + moduleWidth * x + moduleWidth / 2;
      const yPos = params.heightMm / 2 - moduleHeight * y - moduleHeight / 2;

      module.position.set(xPos, yPos, zOffset);
      group.add(module);
    }
  }

  return group;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read template preview image."));
    image.src = src;
  });
}

export function createQrModelGroup(value: string, params: StlParams): Group {
  const matrix = buildQrMatrix(value);
  return createModelGroupFromGrid(
    {
      width: matrix.size,
      height: matrix.size,
      data: matrix.data,
    },
    params
  );
}

export async function createTemplateModelGroup(imageDataUrl: string, params: StlParams): Promise<Group> {
  const image = await loadImage(imageDataUrl);
  const sampleWidth = 132;
  const sampleHeight = Math.max(84, Math.round((sampleWidth * image.height) / image.width));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const data: boolean[] = new Array(sampleWidth * sampleHeight);

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const idx = (y * sampleWidth + x) * 4;
      const red = pixels[idx];
      const green = pixels[idx + 1];
      const blue = pixels[idx + 2];
      const alpha = pixels[idx + 3];
      const luma = red * 0.299 + green * 0.587 + blue * 0.114;
      data[y * sampleWidth + x] = alpha > 20 && luma < 165;
    }
  }

  return createModelGroupFromGrid(
    {
      width: sampleWidth,
      height: sampleHeight,
      data,
    },
    params
  );
}

export function disposeQrModelGroup(group: Group) {
  group.traverse((item) => {
    const candidate = item as Mesh;
    if (!candidate.isMesh) {
      return;
    }

    candidate.geometry.dispose();

    if (Array.isArray(candidate.material)) {
      candidate.material.forEach((material) => material.dispose());
      return;
    }

    candidate.material.dispose();
  });
}