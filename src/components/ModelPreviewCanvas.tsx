import { useEffect, useRef } from "react";
import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
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
    camera.position.set(0, -74, 56);
    camera.lookAt(0, 0, 0);

    const ambient = new AmbientLight("#ffffff", 1.1);
    const keyLight = new DirectionalLight("#ffffff", 0.9);
    keyLight.position.set(-20, -35, 100);
    scene.add(ambient);
    scene.add(keyLight);

    const modelGroup = createQrModelGroup(value, params);
    modelGroup.rotation.x = -0.82;
    scene.add(modelGroup);

    let frame = 0;
    let active = true;

    const renderLoop = () => {
      if (!active) {
        return;
      }

      frame += 0.006;
      modelGroup.rotation.z = frame;
      renderer.render(scene, camera);
      requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      active = false;
      scene.remove(modelGroup);
      disposeQrModelGroup(modelGroup);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [value, params]);

  return <div className="model-canvas-host" ref={hostRef} />;
};

export default ModelPreviewCanvas;