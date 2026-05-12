import { BoxGeometry, BufferGeometry, Group, Material, Mesh, MeshNormalMaterial } from "three";
import { StlParams } from "../types";
import { buildQrMatrix } from "./qr";

const DETAIL_SCALE: Record<StlParams["detail"], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

const TEMPLATE_SAMPLE_WIDTH: Record<StlParams["detail"], number> = {
  low: 144,
  medium: 200,
  high: 256,
};

const TEMPLATE_PREVIEW_SAMPLE_WIDTH: Record<StlParams["detail"], number> = {
  low: 96,
  medium: 128,
  high: 160,
};

const TEMPLATE_EDGE_GUARD_PX = 2;

type GridMask = {
  width: number;
  height: number;
  data: boolean[];
};

type MaskBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type ModelDimensions = {
  widthMm: number;
  heightMm: number;
};

type ModelBuildOptions = {
  dimensions?: ModelDimensions;
  baseMask?: GridMask;
};

type TemplateModelGroupOptions = {
  mode?: "export" | "preview";
};

type Run = {
  startX: number;
  length: number;
};

function collectRowRuns(mask: GridMask, row: number): Run[] {
  const runs: Run[] = [];
  let x = 0;

  while (x < mask.width) {
    while (x < mask.width && !mask.data[row * mask.width + x]) {
      x += 1;
    }

    if (x >= mask.width) {
      break;
    }

    const startX = x;
    while (x < mask.width && mask.data[row * mask.width + x]) {
      x += 1;
    }

    runs.push({
      startX,
      length: x - startX,
    });
  }

  return runs;
}

function getMaskBounds(mask: GridMask): MaskBounds | null {
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
    return null;
  }

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
  };
}

function cropMaskToBounds(mask: GridMask, bounds: MaskBounds, padding = 0): GridMask {
  const left = Math.max(0, bounds.left - padding);
  const top = Math.max(0, bounds.top - padding);
  const right = Math.min(mask.width - 1, bounds.right + padding);
  const bottom = Math.min(mask.height - 1, bounds.bottom + padding);
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

function createModelGroupFromGrid(mask: GridMask, params: StlParams, options?: ModelBuildOptions): Group {
  const modelWidthMm = options?.dimensions?.widthMm ?? params.widthMm;
  const modelHeightMm = options?.dimensions?.heightMm ?? params.heightMm;
  const detailScale = DETAIL_SCALE[params.detail];
  const moduleWidth = modelWidthMm / mask.width;
  const moduleHeight = modelHeightMm / mask.height;
  const raisedDepth = Math.max(0.4, params.depthMm * detailScale * 0.7);
  const group = new Group();
  const material = new MeshNormalMaterial();
  const geometryCache = new Map<string, BoxGeometry>();

  const getGeometry = (width: number, height: number, depth: number) => {
    const key = `${width}:${height}:${depth}`;
    const cached = geometryCache.get(key);
    if (cached) {
      return cached;
    }

    const geometry = new BoxGeometry(width, height, depth);
    geometryCache.set(key, geometry);
    return geometry;
  };

  if (params.baseMm > 0) {
    const baseMask = options?.baseMask;

    if (baseMask && baseMask.width === mask.width && baseMask.height === mask.height) {
      for (let y = 0; y < baseMask.height; y += 1) {
        const runs = collectRowRuns(baseMask, y);
        for (const run of runs) {
          const baseVoxel = new Mesh(getGeometry(moduleWidth * run.length, moduleHeight, params.baseMm), material);

          const xPos =
            -modelWidthMm / 2 +
            moduleWidth * run.startX +
            (moduleWidth * run.length) / 2;
          const yPos = modelHeightMm / 2 - moduleHeight * y - moduleHeight / 2;
          baseVoxel.position.set(xPos, yPos, params.baseMm / 2);
          group.add(baseVoxel);
        }
      }
    } else {
      const base = new Mesh(getGeometry(modelWidthMm, modelHeightMm, params.baseMm), material);
      base.position.set(0, 0, params.baseMm / 2);
      group.add(base);
    }
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

      const module = new Mesh(getGeometry(moduleWidth, moduleHeight, moduleDepth), material);

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
  const matrix = buildQrMatrix(value, params.qrType ?? "standard");
  return createModelGroupFromGrid(
    {
      width: matrix.size,
      height: matrix.size,
      data: matrix.data,
    },
    params
  );
}

export async function createTemplateModelGroup(
  imageDataUrl: string,
  params: StlParams,
  options?: TemplateModelGroupOptions
): Promise<Group> {
  const image = await loadImage(imageDataUrl);
  const sampleWidth = options?.mode === "preview" ? TEMPLATE_PREVIEW_SAMPLE_WIDTH[params.detail] : TEMPLATE_SAMPLE_WIDTH[params.detail];
  const sampleHeight = Math.max(84, Math.round((sampleWidth * image.height) / image.width));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = options?.mode === "preview" ? "low" : "high";
  ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const detailData: boolean[] = new Array(sampleWidth * sampleHeight);
  const baseData: boolean[] = new Array(sampleWidth * sampleHeight);

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const isInEdgeGuard =
        x < TEMPLATE_EDGE_GUARD_PX ||
        y < TEMPLATE_EDGE_GUARD_PX ||
        x >= sampleWidth - TEMPLATE_EDGE_GUARD_PX ||
        y >= sampleHeight - TEMPLATE_EDGE_GUARD_PX;

      if (isInEdgeGuard) {
        detailData[y * sampleWidth + x] = false;
        baseData[y * sampleWidth + x] = false;
        continue;
      }

      const idx = (y * sampleWidth + x) * 4;
      const red = pixels[idx];
      const green = pixels[idx + 1];
      const blue = pixels[idx + 2];
      const alpha = pixels[idx + 3];
      const luma = red * 0.299 + green * 0.587 + blue * 0.114;
      const isOpaque = alpha > 12;
      baseData[y * sampleWidth + x] = isOpaque;
      detailData[y * sampleWidth + x] = isOpaque && luma < 176;
    }
  }

  const denoisedDetailMask = removeTinyIslands(
    {
      width: sampleWidth,
      height: sampleHeight,
      data: detailData,
    },
    3
  );

  const denoisedBaseMask = removeTinyIslands(
    {
      width: sampleWidth,
      height: sampleHeight,
      data: baseData,
    },
    40
  );

  const bounds = getMaskBounds(denoisedBaseMask);
  if (!bounds) {
    return createModelGroupFromGrid(
      {
        width: sampleWidth,
        height: sampleHeight,
        data: denoisedDetailMask.data,
      },
      params
    );
  }

  const croppedBaseMask = cropMaskToBounds(denoisedBaseMask, bounds, 0);
  const croppedDetailMask = cropMaskToBounds(denoisedDetailMask, bounds, 0);
  const widthRatio = croppedBaseMask.width / sampleWidth;
  const heightRatio = croppedBaseMask.height / sampleHeight;

  return createModelGroupFromGrid(croppedDetailMask, params, {
    dimensions: {
      widthMm: params.widthMm * widthRatio,
      heightMm: params.heightMm * heightRatio,
    },
    baseMask: croppedBaseMask,
  });
}

export function disposeQrModelGroup(group: Group) {
  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();

  group.traverse((item) => {
    const candidate = item as Mesh;
    if (!candidate.isMesh) {
      return;
    }

    if (!disposedGeometries.has(candidate.geometry)) {
      candidate.geometry.dispose();
      disposedGeometries.add(candidate.geometry);
    }

    if (Array.isArray(candidate.material)) {
      candidate.material.forEach((material) => {
        if (!disposedMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      });
      return;
    }

    if (!disposedMaterials.has(candidate.material)) {
      candidate.material.dispose();
      disposedMaterials.add(candidate.material);
    }
  });
}