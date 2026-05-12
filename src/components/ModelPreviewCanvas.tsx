import { useEffect, useRef } from "react";
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
import { StlParams } from "../types";
import { createTemplateModelGroup, disposeQrModelGroup } from "../lib/modelGeometry";

type Props = {
  imageDataUrl: string;
  params: StlParams;
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

const ModelPreviewCanvas: React.FC<Props> = ({ imageDataUrl, params, onLoadingChange }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const homeViewRef = useRef<HomeView | null>(null);

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

    let active = true;
    let modelGroup: Group | null = null;

    const renderScene = () => {
      if (!active) {
        return;
      }

      renderer.render(scene, camera);
    };

    controls.addEventListener("change", renderScene);
    renderScene();
    onLoadingChange?.(true);

    void createTemplateModelGroup(imageDataUrl, params, { mode: "preview" })
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
      .catch(() => {
        active = false;
        onLoadingChange?.(false);
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
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [imageDataUrl, onLoadingChange, params]);

  return (
    <div className="model-canvas-shell">
      <div className="model-canvas-host" ref={hostRef} />
      <div className="model-ctrl-pod" aria-label="3D view controls">
        {/* Row 1 — up arrow */}
        <span className="model-ctrl-spacer" />
        <button type="button" className="model-ctrl-btn" onClick={() => panView(0, 1)} aria-label="Pan up" title="Pan up">
          <IconArrowUp />
        </button>
        <span className="model-ctrl-spacer" />

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

        {/* Row 3 — down arrow */}
        <span className="model-ctrl-spacer" />
        <button type="button" className="model-ctrl-btn" onClick={() => panView(0, -1)} aria-label="Pan down" title="Pan down">
          <IconArrowDown />
        </button>
        <span className="model-ctrl-spacer" />

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
  );
};

export default ModelPreviewCanvas;
