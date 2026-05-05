import { useEffect, useRef } from "react";
import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { StlParams } from "../types";
import { createQrModelGroup, disposeQrModelGroup } from "../lib/modelGeometry";

type Props = {
  value: string;
  params: StlParams;
};

const ModelPreviewCanvas: React.FC<Props> = ({ value, params }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const width = host.clientWidth || 320;
    const height = host.clientHeight || 260;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color("#f7f9fc");

    const camera = new PerspectiveCamera(48, width / height, 0.1, 1000);
    camera.position.set(62, -74, 56);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.minDistance = 24;
    controls.maxDistance = 230;
    controls.target.set(0, 0, Math.max(params.baseMm, 0.8));

    const ambient = new AmbientLight("#ffffff", 1.1);
    const keyLight = new DirectionalLight("#ffffff", 0.9);
    keyLight.position.set(-20, -35, 100);
    scene.add(ambient);
    scene.add(keyLight);

    const modelGroup = createQrModelGroup(value, params);
    scene.add(modelGroup);

    let active = true;
    let frameId = 0;

    const renderLoop = () => {
      if (!active) {
        return;
      }

      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = host.clientWidth || 320;
      const nextHeight = host.clientHeight || 260;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });

    resizeObserver.observe(host);

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      scene.remove(modelGroup);
      disposeQrModelGroup(modelGroup);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [value, params]);

  return <div className="model-canvas-host" ref={hostRef} />;
};

export default ModelPreviewCanvas;