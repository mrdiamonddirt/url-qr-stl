import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshNormalMaterial,
  MeshStandardMaterial,
} from "three";
import { ModelPreviewOptions, PreviewMaterialType, StlParams } from "../types";
import { buildQrMatrix } from "./qr";
import type { TemplateCompositionExtents } from "./templatePreview";

const DETAIL_SCALE: Record<StlParams["detail"], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

const TEMPLATE_SAMPLE_WIDTH: Record<StlParams["detail"], number> = {
  low: 200,
  medium: 300,
  high: 400,
};

const TEMPLATE_PREVIEW_SAMPLE_WIDTH: Record<StlParams["detail"], number> = {
  low: 136,
  medium: 192,
  high: 256,
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
  baseMaterial?: Material;
  moduleMaterial?: Material;
};

type TemplateModelGroupOptions = {
  mode?: "export" | "preview";
  previewOptions?: ModelPreviewOptions;
  compositionExtents?: TemplateCompositionExtents;
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

function combineTemplateBounds(extentsBounds: MaskBounds | null, detectedBounds: MaskBounds | null): MaskBounds | null {
  // Use visible content bounds first to avoid converting transparent capture margin
  // into model base geometry. Extents remain as a fallback safety net.
  if (detectedBounds) {
    return detectedBounds;
  }
  return extentsBounds;
}

export function resolveTemplateCropBounds(
  extentsBounds: { left: number; top: number; right: number; bottom: number } | null,
  detectedBounds: { left: number; top: number; right: number; bottom: number } | null
): { left: number; top: number; right: number; bottom: number } | null {
  return combineTemplateBounds(extentsBounds, detectedBounds);
}

function toMaskBoundsFromExtents(
  extents: TemplateCompositionExtents,
  sampleWidth: number,
  sampleHeight: number
): MaskBounds | null {
  const normalizedLeft = Math.min(extents.left, extents.right);
  const normalizedTop = Math.min(extents.top, extents.bottom);
  const normalizedRight = Math.max(extents.left, extents.right);
  const normalizedBottom = Math.max(extents.top, extents.bottom);

  if (normalizedRight <= normalizedLeft || normalizedBottom <= normalizedTop) {
    return null;
  }

  const edgeMaxX = sampleWidth - TEMPLATE_EDGE_GUARD_PX - 1;
  const edgeMaxY = sampleHeight - TEMPLATE_EDGE_GUARD_PX - 1;
  const edgeMinX = TEMPLATE_EDGE_GUARD_PX;
  const edgeMinY = TEMPLATE_EDGE_GUARD_PX;

  if (edgeMaxX < edgeMinX || edgeMaxY < edgeMinY) {
    return null;
  }

  const paddingPx = 1;
  const left = Math.max(edgeMinX, Math.floor(normalizedLeft * sampleWidth) - paddingPx);
  const top = Math.max(edgeMinY, Math.floor(normalizedTop * sampleHeight) - paddingPx);
  const right = Math.min(edgeMaxX, Math.ceil(normalizedRight * sampleWidth) - 1 + paddingPx);
  const bottom = Math.min(edgeMaxY, Math.ceil(normalizedBottom * sampleHeight) - 1 + paddingPx);

  if (right < left || bottom < top) {
    return null;
  }

  return { left, top, right, bottom };
}

export function resolveMaskBoundsForTemplateExtents(
  extents: TemplateCompositionExtents,
  sampleWidth: number,
  sampleHeight: number
): { left: number; top: number; right: number; bottom: number } | null {
  return toMaskBoundsFromExtents(extents, sampleWidth, sampleHeight);
}

function createMaterialFromOptions(type: PreviewMaterialType | undefined, color: string | undefined): Material {
  if (!type || type === "normal") {
    return new MeshNormalMaterial();
  }
  const mat = new MeshStandardMaterial({ color: new Color(color ?? "#aaaaaa") });
  if (type === "matte") {
    mat.roughness = 1;
    mat.metalness = 0;
  } else if (type === "plastic") {
    mat.roughness = 0.4;
    mat.metalness = 0;
  } else if (type === "metallic") {
    mat.roughness = 0.2;
    mat.metalness = 0.8;
  }
  return mat;
}

function createSolidModelGroupFromGrid(mask: GridMask, params: StlParams, options?: ModelBuildOptions): Group {
  const modelWidthMm = options?.dimensions?.widthMm ?? params.widthMm;
  const modelHeightMm = options?.dimensions?.heightMm ?? params.heightMm;
  const detailScale = DETAIL_SCALE[params.detail];
  const moduleWidth = modelWidthMm / mask.width;
  const moduleHeight = modelHeightMm / mask.height;
  const raisedDepth = Math.max(1, params.depthMm * detailScale * 0.7);
  const moduleDepth = params.bold ? raisedDepth * 1.5 : raisedDepth;
  const baseDepth = Math.max(0, params.baseMm);
  const baseMask = options?.baseMask;

  const basePresent = new Array<boolean>(mask.width * mask.height).fill(false);
  const raisedPresent = new Array<boolean>(mask.width * mask.height).fill(false);

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const idx = y * mask.width + x;
      const canHaveBase =
        baseDepth > 0 &&
        (!baseMask ||
          (baseMask.width === mask.width && baseMask.height === mask.height && Boolean(baseMask.data[idx])));
      basePresent[idx] = canHaveBase;

      const isDark = mask.data[idx];
      raisedPresent[idx] = params.invert ? !isDark : isDark;
    }
  }

  const positions: number[] = [];
  const xCoords = new Array<number>(mask.width + 1);
  const yCoords = new Array<number>(mask.height + 1);

  for (let x = 0; x <= mask.width; x += 1) {
    xCoords[x] = -modelWidthMm / 2 + x * moduleWidth;
  }

  for (let y = 0; y <= mask.height; y += 1) {
    yCoords[y] = modelHeightMm / 2 - y * moduleHeight;
  }

  const addTriangle = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  const addQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number]
  ) => {
    addTriangle(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    addTriangle(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  };

  const hasCell = (cells: boolean[], x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
      return false;
    }
    return cells[y * mask.width + x];
  };

  const emitLayer = (
    cells: boolean[],
    zBottom: number,
    zTop: number,
    includeTop: (idx: number) => boolean,
    includeBottom: (idx: number) => boolean
  ) => {
    if (zTop <= zBottom) {
      return;
    }

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (!hasCell(cells, x, y)) {
          continue;
        }

        const idx = y * mask.width + x;
        const x0 = xCoords[x];
        const x1 = xCoords[x + 1];
        const y0 = yCoords[y];
        const y1 = yCoords[y + 1];

        if (includeTop(idx)) {
          addQuad([x0, y0, zTop], [x0, y1, zTop], [x1, y1, zTop], [x1, y0, zTop]);
        }

        if (includeBottom(idx)) {
          addQuad([x0, y0, zBottom], [x1, y0, zBottom], [x1, y1, zBottom], [x0, y1, zBottom]);
        }

        if (!hasCell(cells, x, y - 1)) {
          // North (+Y)
          addQuad([x0, y0, zBottom], [x1, y0, zBottom], [x1, y0, zTop], [x0, y0, zTop]);
        }

        if (!hasCell(cells, x, y + 1)) {
          // South (-Y)
          addQuad([x0, y1, zBottom], [x0, y1, zTop], [x1, y1, zTop], [x1, y1, zBottom]);
        }

        if (!hasCell(cells, x - 1, y)) {
          // West (-X)
          addQuad([x0, y0, zBottom], [x0, y0, zTop], [x0, y1, zTop], [x0, y1, zBottom]);
        }

        if (!hasCell(cells, x + 1, y)) {
          // East (+X)
          addQuad([x1, y0, zBottom], [x1, y1, zBottom], [x1, y1, zTop], [x1, y0, zTop]);
        }
      }
    }
  };

  emitLayer(
    basePresent,
    0,
    baseDepth,
    (idx) => !raisedPresent[idx],
    () => true
  );

  emitLayer(
    raisedPresent,
    baseDepth,
    baseDepth + moduleDepth,
    () => true,
    (idx) => !basePresent[idx]
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  const mesh = new Mesh(geometry, new MeshNormalMaterial());
  const group = new Group();
  group.add(mesh);
  return group;
}

function createModelGroupFromGrid(mask: GridMask, params: StlParams, options?: ModelBuildOptions): Group {
  const hasPreviewMaterials = Boolean(options?.baseMaterial || options?.moduleMaterial);
  if (!hasPreviewMaterials) {
    return createSolidModelGroupFromGrid(mask, params, options);
  }

  const modelWidthMm = options?.dimensions?.widthMm ?? params.widthMm;
  const modelHeightMm = options?.dimensions?.heightMm ?? params.heightMm;
  const detailScale = DETAIL_SCALE[params.detail];
  const moduleWidth = modelWidthMm / mask.width;
  const moduleHeight = modelHeightMm / mask.height;
  const raisedDepth = Math.max(1, params.depthMm * detailScale * 0.7); // Default depth set to 1mm

  // Allow dynamic boldness adjustment by scaling depth
  const moduleDepth = params.bold ? raisedDepth * 1.5 : raisedDepth;

  const group = new Group();
  const baseMaterial = options?.baseMaterial ?? new MeshNormalMaterial();
  const moduleMaterial = options?.moduleMaterial ?? new MeshNormalMaterial();
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
          const baseVoxel = new Mesh(getGeometry(moduleWidth * run.length, moduleHeight, params.baseMm), baseMaterial);

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
      const base = new Mesh(getGeometry(modelWidthMm, modelHeightMm, params.baseMm), baseMaterial);
      base.position.set(0, 0, params.baseMm / 2);
      group.add(base);
    }
  }

  const zOffset = params.baseMm + moduleDepth / 2;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const idx = y * mask.width + x;
      const isDark = mask.data[idx];
      const shouldRaise = params.invert ? !isDark : isDark;

      if (!shouldRaise) {
        continue;
      }

      const module = new Mesh(getGeometry(moduleWidth, moduleHeight, moduleDepth), moduleMaterial);

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
  ctx.imageSmoothingQuality = options?.mode === "preview" ? "medium" : "high";
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
      const isOpaque = alpha > 10;
      baseData[y * sampleWidth + x] = isOpaque;
      detailData[y * sampleWidth + x] = isOpaque && luma < 184;
    }
  }

  const denoisedBaseMask = removeTinyIslands(
    {
      width: sampleWidth,
      height: sampleHeight,
      data: baseData,
    },
    24
  );

  let denoisedDetailMask = removeTinyIslands(
    {
      width: sampleWidth,
      height: sampleHeight,
      data: detailData,
    },
    2
  );

  const detectedBounds = getMaskBounds(denoisedDetailMask) ?? getMaskBounds(denoisedBaseMask);
  const extentsBounds = options?.compositionExtents
    ? toMaskBoundsFromExtents(options.compositionExtents, sampleWidth, sampleHeight)
    : null;
  const bounds = combineTemplateBounds(extentsBounds, detectedBounds);
  const previewMaterials = options?.previewOptions
    ? {
        baseMaterial: createMaterialFromOptions(options.previewOptions.baseMaterial, options.previewOptions.baseColor),
        moduleMaterial: createMaterialFromOptions(options.previewOptions.qrMaterial, options.previewOptions.qrColor),
      }
    : undefined;
  if (!bounds) {
    return createModelGroupFromGrid(
      {
        width: sampleWidth,
        height: sampleHeight,
        data: denoisedDetailMask.data,
      },
      params,
      previewMaterials
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
    ...previewMaterials,
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