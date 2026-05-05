import { BoxGeometry, Group, Mesh, MeshNormalMaterial } from "three";
import { StlParams } from "../types";
import { buildQrMatrix } from "./qr";

const DETAIL_SCALE: Record<StlParams["detail"], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

export function createQrModelGroup(value: string, params: StlParams): Group {
  const matrix = buildQrMatrix(value);
  const moduleCount = matrix.size;
  const detailScale = DETAIL_SCALE[params.detail];
  const moduleWidth = params.widthMm / moduleCount;
  const moduleHeight = params.heightMm / moduleCount;
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

  for (let y = 0; y < moduleCount; y += 1) {
    for (let x = 0; x < moduleCount; x += 1) {
      const idx = y * moduleCount + x;
      const isDark = matrix.data[idx];
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