export type SeoFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const SEO_FAQ_ITEMS: SeoFaqItem[] = [
  {
    id: "free-tier",
    question: "Is URL 2 STL free to use?",
    answer:
      "Yes. The free tier lets you generate QR tags, test URL conversion settings, and validate STL or OBJ output before moving to premium workflows.",
  },
  {
    id: "auto-conversion",
    question: "Can I auto-convert a URL into a printable 3D model workflow?",
    answer:
      "Yes. The editor auto-generates QR content from your URL, then you can compose, render, and export print-ready files for production.",
  },
  {
    id: "stl-vs-obj",
    question: "What is the difference between STL and OBJ exports?",
    answer:
      "STL is common for direct 3D printing pipelines, while OBJ works well for broader 3D model and external render workflows.",
  },
  {
    id: "render-preview",
    question: "Can I render a preview before printing?",
    answer:
      "Yes. Use the render stage to review model details before export so your final print settings are predictable.",
  },
  {
    id: "qr-maker-use-cases",
    question: "Who is this QR maker for?",
    answer:
      "URL 2 STL is designed for makers, product teams, and creators who need scannable QR tags tied to physical products or packaging.",
  },
  {
    id: "obj-converter-intent",
    question: "Can I use URL 2 STL as a URL to OBJ converter?",
    answer:
      "Yes. You can convert URLs into QR-based 3D assets and export them as OBJ when your workflow needs wider 3D compatibility.",
  },
];
