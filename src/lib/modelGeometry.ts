import { BoxGeometry, Group, Mesh, MeshNormalMaterial } from "three";
import { StlParams } from "../types";
import { buildQrMatrix } from "./qr";

const DETAIL_SCALE: Record<StlParams["detail"], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

const TEMPLATE_SAMPLE_WIDTH: Record<StlParams["detail"], number> = {
  low: 144,
  medium: 180,
  high: 216,
};

type GridMask = {
  width: number;
  height: number;
  data: boolean[];
};

type ModelDimensions = {
  widthMm: number;
  heightMm: number;
};

type Rgb = {
  red: number;
  green: number;
  blue: number;
};

function cropMask(mask: GridMask, padding = 1): GridMask {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.data[y * mask.width + x]) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return mask;
  }

  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(mask.width - 1, maxX + padding);
  const bottom = Math.min(mask.height - 1, maxY + padding);
  const width = right - left + 1;
  const height = bottom - top + 1;
  const data = new Array<boolean>(width * height).fill(false);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      data[(y - top) * width + (x - left)] = mask.data[y * mask.width + x];
    }
  }

  return { width, height, data };
}

function createModelGroupFromGrid(mask: GridMask, params: StlParams, dimensions?: ModelDimensions): Group {
  const modelWidthMm = dimensions?.widthMm ?? params.widthMm;
  const modelHeightMm = dimensions?.heightMm ?? params.heightMm;
  const detailScale = DETAIL_SCALE[params.detail];
  const moduleWidth = modelWidthMm / mask.width;
  const moduleHeight = modelHeightMm / mask.height;
  const raisedDepth = Math.max(0.4, params.depthMm * detailScale * 0.7);
  const group = new Group();

  if (params.baseMm > 0) {
    const base = new Mesh(
      new BoxGeometry(modelWidthMm, modelHeightMm, params.baseMm),
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

      const xPos = -modelWidthMm / 2 + moduleWidth * x + moduleWidth / 2;
      const yPos = modelHeightMm / 2 - moduleHeight * y - moduleHeight / 2;

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

function getCornerAverageColor(pixels: Uint8ClampedArray, width: number, height: number): Rgb {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ] as const;

  let red = 0;
  let green = 0;
  let blue = 0;

  for (const [x, y] of corners) {
    const idx = (y * width + x) * 4;
    red += pixels[idx];
    green += pixels[idx + 1];
    blue += pixels[idx + 2];
  }

  return {
    red: red / corners.length,
    green: green / corners.length,
    blue: blue / corners.length,
  };
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.abs(a.red - b.red) + Math.abs(a.green - b.green) + Math.abs(a.blue - b.blue);
}

function removeTinyIslands(mask: GridMask, minArea: number): GridMask {
  if (minArea <= 1) {
    return mask;
  }

  const visited = new Array<boolean>(mask.width * mask.height).fill(false);
  const kept = new Array<boolean>(mask.width * mask.height).fill(false);
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const startIdx = y * mask.width + x;
      if (!mask.data[startIdx] || visited[startIdx]) {
        continue;
      }

      const queue: Array<[number, number]> = [[x, y]];
      const component: number[] = [];
      visited[startIdx] = true;

      while (queue.length > 0) {
        const [cx, cy] = queue.pop() as [number, number];
        const idx = cy * mask.width + cx;
        component.push(idx);

        for (const [dx, dy] of directions) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= mask.width || ny >= mask.height) {
            continue;
          }

          const nIdx = ny * mask.width + nx;
          if (!mask.data[nIdx] || visited[nIdx]) {
            continue;
          }

          visited[nIdx] = true;
          queue.push([nx, ny]);
        }
      }

      if (component.length >= minArea) {
        for (const idx of component) {
          kept[idx] = true;
        }
      }
    }
  }

  return {
    width: mask.width,
    height: mask.height,
    data: kept,
  };
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
  const sampleWidth = TEMPLATE_SAMPLE_WIDTH[params.detail];
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
  const background = getCornerAverageColor(pixels, sampleWidth, sampleHeight);
  const data: boolean[] = new Array(sampleWidth * sampleHeight);

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const idx = (y * sampleWidth + x) * 4;
      const red = pixels[idx];
      const green = pixels[idx + 1];
      const blue = pixels[idx + 2];
      const alpha = pixels[idx + 3];
      const pixel = { red, green, blue };
      const luma = red * 0.299 + green * 0.587 + blue * 0.114;
      const distanceFromBackground = colorDistance(pixel, background);
      data[y * sampleWidth + x] = alpha > 18 && luma < 158 && distanceFromBackground > 32;
    }
  }

  const denoisedMask = removeTinyIslands(
    {
      width: sampleWidth,
      height: sampleHeight,
      data,
    },
    6
  );

  const croppedMask = cropMask(
    denoisedMask,
    3
  );

  const widthRatio = croppedMask.width / sampleWidth;
  const heightRatio = croppedMask.height / sampleHeight;

  return createModelGroupFromGrid(croppedMask, params, {
    widthMm: params.widthMm * widthRatio,
    heightMm: params.heightMm * heightRatio,
  });
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