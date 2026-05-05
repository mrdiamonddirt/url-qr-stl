import { OBJExporter, STLExporter } from "three-stdlib";
import { StlParams } from "../types";
import { createQrModelGroup, disposeQrModelGroup } from "./modelGeometry";

export function createQrStlBlob(value: string, params: StlParams): Blob {
  const group = createQrModelGroup(value, params);

  const exporter = new STLExporter();
  const output = exporter.parse(group, { binary: true });
  disposeQrModelGroup(group);

  if (typeof output === "string") {
    return new Blob([output], { type: "model/stl" });
  }

  const sourceBuffer = output instanceof DataView ? output.buffer : output;
  const arrayBuffer = sourceBuffer.slice(0) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "model/stl" });
}

export function createQrObjBlob(value: string, params: StlParams): Blob {
  const group = createQrModelGroup(value, params);
  const exporter = new OBJExporter();
  const output = exporter.parse(group);
  disposeQrModelGroup(group);
  return new Blob([output], { type: "model/obj" });
}

export function downloadStl(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}
