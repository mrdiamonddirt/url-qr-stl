import { QrTemplate } from "../types";

export const TEMPLATE_PRESETS: QrTemplate[] = [
  {
    id: "dock-tag",
    name: "Dock Tag",
    description: "High contrast frame for outdoor labels.",
    frameStyle: "rounded",
    accentColor: "#0b9f7a",
    fields: [
      { key: "line1", label: "Top text", placeholder: "MARINA A", defaultValue: "MARINA A" },
      { key: "line2", label: "Bottom text", placeholder: "SLIP 24", defaultValue: "SLIP 24" },
    ],
  },
  {
    id: "asset-tag",
    name: "Asset Tag",
    description: "Compact badge for equipment and bins.",
    frameStyle: "sharp",
    accentColor: "#164f9e",
    fields: [
      { key: "line1", label: "Asset", placeholder: "PUMP-09", defaultValue: "PUMP-09" },
      { key: "line2", label: "Owner", placeholder: "OPS", defaultValue: "OPS" },
    ],
  },
  {
    id: "event-pass",
    name: "Event Pass",
    description: "Friendly frame with rounded title chip.",
    frameStyle: "circle",
    accentColor: "#c34e1f",
    fields: [
      { key: "line1", label: "Event", placeholder: "BAY RUN", defaultValue: "BAY RUN" },
      { key: "line2", label: "Seat", placeholder: "B12", defaultValue: "B12" },
    ],
  },
];
