import { useCallback, useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ModelPreviewOptions, PreviewMaterialType, StlParams } from "../types";
import { createTemplateModelGroup, disposeQrModelGroup } from "../lib/modelGeometry";
import type { TemplateCompositionExtents } from "../lib/templatePreview";

type Props = {
  imageDataUrl: string;
  params: StlParams;
  compositionExtents?: TemplateCompositionExtents;
  previewOptions?: ModelPreviewOptions;
  onPreviewOptionsChange?: (opts: ModelPreviewOptions) => void;
  onLoadingChange?: (isLoading: boolean) => void;
};

type HomeView = {
  position: Vector3;
  target: Vector3;
};

const IconArrowUp = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="2,11 8,5 14,11" />
  </svg>
);

const IconArrowDown = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="2,5 8,11 14,5" />
  </svg>
);

const IconArrowLeft = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="11,2 5,8 11,14" />
  </svg>
);

const IconArrowRight = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5,2 11,8 5,14" />
  </svg>
);

const IconHome = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 7L8 1L15 7V15H10.5V11H5.5V15H1V7Z" />
  </svg>
);

const IconZoomIn = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="4.5" />
    <line x1="6.5" y1="4.2" x2="6.5" y2="8.8" />
    <line x1="4.2" y1="6.5" x2="8.8" y2="6.5" />
    <line x1="10" y1="10" x2="14.5" y2="14.5" />
  </svg>
);

const IconZoomOut = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="4.5" />
    <line x1="4.2" y1="6.5" x2="8.8" y2="6.5" />
    <line x1="10" y1="10" x2="14.5" y2="14.5" />
  </svg>
);

const IconOrbit = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" />
    <polyline points="8,0 8,4 12,4" />
  </svg>
);

const IconFlatView = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="12" height="8" rx="1.5" />
    <line x1="5" y1="8" x2="11" y2="8" />
  </svg>
);

const IconFront = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
    <line x1="8" y1="5" x2="8" y2="11" />
    <line x1="5" y1="8" x2="11" y2="8" />
  </svg>
);

const IconRotateQuarter = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6A4 4 0 1 1 8 12" />
    <polyline points="8,9.5 8,12 10.5,12" />
    <line x1="8" y1="2" x2="8" y2="5" />
  </svg>
);

const IconLock = ({ locked }: { locked: boolean }) => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    {locked ? <path d="M5.5 7V5.4A2.5 2.5 0 0 1 10.5 5.4V7" /> : <path d="M5.5 7V5.4A2.5 2.5 0 0 1 9.2 3.2" />}
  </svg>
);

const ModelPreviewCanvas: React.FC<Props> = ({
  imageDataUrl,
  params,
  compositionExtents,
  previewOptions,
  onPreviewOptionsChange,
  onLoadingChange,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const homeViewRef = useRef<HomeView | null>(null);
  const ambientLightRef = useRef<AmbientLight | null>(null);
  const keyLightRef = useRef<DirectionalLight | null>(null);
  const renderSceneRef = useRef<(() => void) | null>(null);
  const defaultFovRef = useRef(48);
  const flatViewEnabledRef = useRef(false);
  const orbitLockedRef = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [flatViewEnabled, setFlatViewEnabled] = useState(false);
  const [orbitLocked, setOrbitLocked] = useState(false);

  const renderPreview = useCallback(() => {
    renderSceneRef.current?.();
  }, []);

  const applyFlatViewMode = useCallback((enabled: boolean) => {
    const camera = cameraRef.current;
    const ambient = ambientLightRef.current;
    const key = keyLightRef.current;

    if (ambient) {
      ambient.intensity = enabled ? 1.45 : 1.1;
    }

    if (key) {
      key.intensity = enabled ? 0.2 : 0.9;
    }

    if (camera) {
      camera.fov = enabled ? 36 : defaultFovRef.current;
      camera.updateProjectionMatrix();
    }

    renderPreview();
  }, [renderPreview]);

  const toggleFlatViewMode = () => {
    setFlatViewEnabled((prev) => {
      const next = !prev;
      flatViewEnabledRef.current = next;
      applyFlatViewMode(next);
      return next;
    });
  };

  const applyOrbitLockMode = useCallback((locked: boolean) => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    controls.enableRotate = !locked;
    controls.update();
    renderPreview();
  }, [renderPreview]);

  const toggleOrbitLock = () => {
    setOrbitLocked((prev) => {
      const next = !prev;
      orbitLockedRef.current = next;
      applyOrbitLockMode(next);
      return next;
    });
  };

  const panView = (dx: number, dy: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const distance = camera.position.distanceTo(controls.target);
    const step = Math.max(1.2, distance * 0.08);
    const pan = new Vector3(dx * step, dy * step, 0);

    camera.position.add(pan);
    controls.target.add(pan);
    controls.update();
  };

  const zoomView = (factor: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const offset = new Vector3().subVectors(camera.position, controls.target);
    const currentDistance = offset.length();
    const nextDistance = MathUtils.clamp(currentDistance * factor, controls.minDistance, controls.maxDistance);
    offset.setLength(nextDistance);

    camera.position.copy(controls.target).add(offset);
    controls.update();
  };

  const resetHomeView = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const homeView = homeViewRef.current;
    if (!camera || !controls || !homeView) {
      return;
    }

    camera.position.copy(homeView.position);
    controls.target.copy(homeView.target);
    controls.update();
  };

  const snapFrontView = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const target = controls.target.clone();
    const distance = camera.position.distanceTo(target);
    camera.position.copy(target).addScaledVector(new Vector3(0, 0, 1), distance);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    controls.update();
    renderPreview();
  };

  const rotateQuarterTurn = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const target = controls.target.clone();
    const offset = new Vector3().subVectors(camera.position, target);
    offset.applyAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    controls.update();
    renderPreview();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const width = host.clientWidth || 320;
    const height = host.clientHeight || 420;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const maxPixelRatio = isCoarsePointer ? 1.25 : 2;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color("#f7f9fc");

    const camera = new PerspectiveCamera(48, width / height, 0.1, 1000);
    defaultFovRef.current = camera.fov;
    camera.position.set(62, -74, 56);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.minDistance = 24;
    controls.maxDistance = 230;
    controls.target.set(0, 0, Math.max(params.baseMm, 0.8));

    cameraRef.current = camera;
    controlsRef.current = controls;

    const ambient = new AmbientLight("#ffffff", 1.1);
    const keyLight = new DirectionalLight("#ffffff", 0.9);
    keyLight.position.set(-20, -35, 100);
    scene.add(ambient);
    scene.add(keyLight);
    ambientLightRef.current = ambient;
    keyLightRef.current = keyLight;

    let active = true;
    let modelGroup: Group | null = null;

    const renderScene = () => {
      if (!active) {
        return;
      }

      renderer.render(scene, camera);
    };

    renderSceneRef.current = renderScene;

    controls.addEventListener("change", renderScene);
    applyOrbitLockMode(orbitLockedRef.current);
    applyFlatViewMode(flatViewEnabledRef.current);
    renderScene();
    onLoadingChange?.(true);

    void createTemplateModelGroup(imageDataUrl, params, {
      mode: "preview",
      previewOptions,
      compositionExtents,
    })
      .then((group) => {
        if (!active) {
          disposeQrModelGroup(group);
          return;
        }

        modelGroup = group;
        scene.add(group);

        // Fit the camera to the generated model so it fills the available viewport.
        const bounds = new Box3().setFromObject(group);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        const radius = Math.max(size.length() / 2, 1.2);
        const viewDirection = new Vector3().subVectors(camera.position, controls.target).normalize();
        const fitHeightDistance = radius / Math.tan(MathUtils.degToRad(camera.fov / 2));
        const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.8);
        const fitDistance = Math.max(fitHeightDistance, fitWidthDistance) * 1.25;

        controls.target.copy(center);
        camera.position.copy(center).addScaledVector(viewDirection, fitDistance);
        camera.near = Math.max(0.1, fitDistance / 100);
        camera.far = Math.max(700, fitDistance * 12);
        camera.updateProjectionMatrix();
        controls.minDistance = Math.max(6, fitDistance * 0.42);
        controls.maxDistance = Math.max(controls.minDistance + 10, fitDistance * 4.6);
        controls.update();
        renderScene();
        onLoadingChange?.(false);

        homeViewRef.current = {
          position: camera.position.clone(),
          target: controls.target.clone(),
        };
      })
      .catch((err) => {
        if (active) {
          console.error("Failed to create 3D model preview:", err);
          active = false;
          onLoadingChange?.(false);
        }
      });

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = host.clientWidth || 320;
      const nextHeight = host.clientHeight || 420;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      renderScene();
    });

    resizeObserver.observe(host);

    return () => {
      active = false;
      onLoadingChange?.(false);
      resizeObserver.disconnect();
      controls.removeEventListener("change", renderScene);
      controls.dispose();
      if (modelGroup) {
        scene.remove(modelGroup);
        disposeQrModelGroup(modelGroup);
      }
      cameraRef.current = null;
      controlsRef.current = null;
      homeViewRef.current = null;
      ambientLightRef.current = null;
      keyLightRef.current = null;
      renderSceneRef.current = null;
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [imageDataUrl, onLoadingChange, params, previewOptions, compositionExtents, applyFlatViewMode, applyOrbitLockMode]);

  return (
    <div className="model-canvas-shell">
      <div className="model-canvas-host" ref={hostRef} />
      <div
        className="model-mat-pod"
        aria-label="Preview material controls"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="model-mat-row">
          <span className="model-mat-label">QR</span>
          <input
            type="color"
            className="model-mat-swatch"
            value={previewOptions?.qrColor ?? "#222222"}
            onChange={(e) => onPreviewOptionsChange?.({ ...previewOptions, qrColor: e.target.value })}
            title="QR module color"
            aria-label="QR module color"
          />
          <select
            className="model-mat-sel"
            value={previewOptions?.qrMaterial ?? "matte"}
            onChange={(e) => onPreviewOptionsChange?.({ ...previewOptions, qrMaterial: e.target.value as PreviewMaterialType })}
            aria-label="QR module material"
          >
            <option value="matte">Matte</option>
            <option value="plastic">Plastic</option>
            <option value="metallic">Metallic</option>
            <option value="normal">Normal</option>
          </select>
        </div>
        <div className="model-mat-row">
          <span className="model-mat-label">Base</span>
          <input
            type="color"
            className="model-mat-swatch"
            value={previewOptions?.baseColor ?? "#e8e8e8"}
            onChange={(e) => onPreviewOptionsChange?.({ ...previewOptions, baseColor: e.target.value })}
            title="Base color"
            aria-label="Base color"
          />
          <select
            className="model-mat-sel"
            value={previewOptions?.baseMaterial ?? "matte"}
            onChange={(e) => onPreviewOptionsChange?.({ ...previewOptions, baseMaterial: e.target.value as PreviewMaterialType })}
            aria-label="Base material"
          >
            <option value="matte">Matte</option>
            <option value="plastic">Plastic</option>
            <option value="metallic">Metallic</option>
            <option value="normal">Normal</option>
          </select>
        </div>
      </div>
      <div
        className={`model-ctrl-pod ${controlsVisible ? "is-open" : "is-collapsed"}`}
        aria-label="3D view controls"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={`model-ctrl-strip ${controlsVisible ? "is-open" : "is-closed"}`}
          role="button"
          tabIndex={0}
          aria-label="Show or hide camera controls"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setControlsVisible((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              setControlsVisible((prev) => !prev);
            }
          }}
        />
        <div className="model-ctrl-grid" aria-hidden={!controlsVisible}>
          {/* Row 1 — flat / up / snap front */}
          <button
            type="button"
            className={`model-ctrl-btn ${flatViewEnabled ? "is-active" : ""}`}
            onClick={toggleFlatViewMode}
            aria-label={flatViewEnabled ? "Turn 3D effect on" : "Turn 3D effect off"}
            title={flatViewEnabled ? "3D effect on" : "3D effect off"}
          >
            <IconFlatView />
          </button>
          <button type="button" className="model-ctrl-btn" onClick={() => panView(0, 1)} aria-label="Pan up" title="Pan up">
            <IconArrowUp />
          </button>
          <button type="button" className="model-ctrl-btn" onClick={snapFrontView} aria-label="Snap to front" title="Snap to front">
            <IconFront />
          </button>

          {/* Row 2 — left / orbit indicator / right */}
          <button type="button" className="model-ctrl-btn" onClick={() => panView(-1, 0)} aria-label="Pan left" title="Pan left">
            <IconArrowLeft />
          </button>
          <span className="model-ctrl-orbit" title="Drag to orbit">
            <IconOrbit />
          </span>
          <button type="button" className="model-ctrl-btn" onClick={() => panView(1, 0)} aria-label="Pan right" title="Pan right">
            <IconArrowRight />
          </button>

          {/* Row 3 — rotate / down / orbit lock */}
          <button type="button" className="model-ctrl-btn" onClick={rotateQuarterTurn} aria-label="Rotate 90 degrees" title="Rotate 90 degrees">
            <IconRotateQuarter />
          </button>
          <button type="button" className="model-ctrl-btn" onClick={() => panView(0, -1)} aria-label="Pan down" title="Pan down">
            <IconArrowDown />
          </button>
          <button
            type="button"
            className={`model-ctrl-btn ${orbitLocked ? "is-active" : ""}`}
            onClick={toggleOrbitLock}
            aria-label={orbitLocked ? "Unlock orbit rotation" : "Lock orbit rotation"}
            title={orbitLocked ? "Unlock orbit" : "Lock orbit"}
          >
            <IconLock locked={orbitLocked} />
          </button>

          {/* Row 4 — zoom out / home / zoom in */}
          <button type="button" className="model-ctrl-btn" onClick={() => zoomView(1.18)} aria-label="Zoom out" title="Zoom out">
            <IconZoomOut />
          </button>
          <button type="button" className="model-ctrl-btn model-ctrl-btn--home" onClick={resetHomeView} aria-label="Reset view" title="Reset to home view">
            <IconHome />
          </button>
          <button type="button" className="model-ctrl-btn" onClick={() => zoomView(0.84)} aria-label="Zoom in" title="Zoom in">
            <IconZoomIn />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelPreviewCanvas;
