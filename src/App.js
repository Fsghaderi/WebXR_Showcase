import "./App.css";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";

const MODELS = [
  { path: "./Fort.glb", name: "Log Fort", scale: 0.01 },
  { path: "./Log_Mash.glb", name: "Log Mash", scale: 0.01 },
  { path: "./Stumpville_House.glb", name: "Stumpville", scale: 0.01 },
];

function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const reticleRef = useRef(null);
  const itemsRef = useRef([]);
  const hitTestSourceRef = useRef(null);
  const hitTestSourceRequestedRef = useRef(false);
  const controllerRef = useRef(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isARActive, setIsARActive] = useState(false);

  // Store selected index in a ref so event handlers can access current value
  const selectedIndexRef = useRef(selectedIndex);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    cameraRef.current = camera;

    // Lighting
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight * 0.85);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    // XR Estimated Light
    const xrLight = new XREstimatedLight(renderer);
    xrLight.addEventListener("estimationstart", () => {
      scene.add(xrLight);
      scene.remove(light);
      if (xrLight.environment) {
        scene.environment = xrLight.environment;
      }
    });

    xrLight.addEventListener("estimationend", () => {
      scene.add(light);
      scene.remove(xrLight);
    });

    // AR Button
    const arButton = ARButton.createButton(renderer, {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "light-estimation"],
      domOverlay: { root: document.body },
    });
    arButton.style.bottom = "20%";
    document.body.appendChild(arButton);

    // Track AR session state
    renderer.xr.addEventListener("sessionstart", () => {
      setIsARActive(true);
    });
    renderer.xr.addEventListener("sessionend", () => {
      setIsARActive(false);
    });

    // Load 3D models
    const loader = new GLTFLoader();
    let loadedCount = 0;

    MODELS.forEach((model, index) => {
      loader.load(model.path, (glb) => {
        itemsRef.current[index] = glb.scene;
        loadedCount++;
        if (loadedCount === MODELS.length) {
          setModelsLoaded(true);
        }
      });
    });

    // Controller for AR interaction
    const controller = renderer.xr.getController(0);
    controllerRef.current = controller;

    const onSelect = () => {
      const reticle = reticleRef.current;
      const items = itemsRef.current;
      const index = selectedIndexRef.current;

      if (reticle && reticle.visible && items[index]) {
        const newModel = items[index].clone();
        newModel.visible = true;

        reticle.matrix.decompose(
          newModel.position,
          newModel.quaternion,
          newModel.scale
        );

        const scaleFactor = MODELS[index].scale;
        newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

        scene.add(newModel);
      }
    };

    controller.addEventListener("select", onSelect);
    scene.add(controller);

    // Reticle (placement indicator)
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Render loop
    const render = (timestamp, frame) => {
      if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequestedRef.current) {
          session.requestReferenceSpace("viewer").then((refSpace) => {
            session.requestHitTestSource({ space: refSpace }).then((source) => {
              hitTestSourceRef.current = source;
            });
          });

          session.addEventListener("end", () => {
            hitTestSourceRequestedRef.current = false;
            hitTestSourceRef.current = null;
          });

          hitTestSourceRequestedRef.current = true;
        }

        if (hitTestSourceRef.current) {
          const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current);

          if (hitTestResults.length) {
            const hit = hitTestResults[0];
            reticle.visible = true;
            reticle.matrix.fromArray(
              hit.getPose(referenceSpace).transform.matrix
            );
          } else {
            reticle.visible = false;
          }
        }
      }

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(render);

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight * 0.85);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.setAnimationLoop(null);
      controller.removeEventListener("select", onSelect);
      if (arButton.parentNode) {
        arButton.parentNode.removeChild(arButton);
      }
      renderer.dispose();
    };
  }, []);

  // Handle model selection
  const handleModelClick = (index) => {
    setSelectedIndex(index);
  };

  // Handle drag start
  const handleDragStart = (e, index) => {
    e.preventDefault();
    setSelectedIndex(index);
    setIsDragging(true);
  };

  // Handle drag end - place model if over AR canvas
  const handleDragEnd = (e) => {
    if (!isDragging) return;
    setIsDragging(false);

    // If AR is active and we have a visible reticle, place the model
    const reticle = reticleRef.current;
    const items = itemsRef.current;
    const scene = sceneRef.current;
    const index = selectedIndexRef.current;

    if (isARActive && reticle && reticle.visible && items[index] && scene) {
      const newModel = items[index].clone();
      newModel.visible = true;

      reticle.matrix.decompose(
        newModel.position,
        newModel.quaternion,
        newModel.scale
      );

      const scaleFactor = MODELS[index].scale;
      newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

      scene.add(newModel);
    }
  };

  // Handle touch events for mobile drag-and-drop
  const handleTouchStart = (e, index) => {
    setSelectedIndex(index);
    setIsDragging(true);
  };

  const handleTouchEnd = (e) => {
    if (!isDragging) return;
    setIsDragging(false);

    // Place model at reticle position
    const reticle = reticleRef.current;
    const items = itemsRef.current;
    const scene = sceneRef.current;
    const index = selectedIndexRef.current;

    if (isARActive && reticle && reticle.visible && items[index] && scene) {
      const newModel = items[index].clone();
      newModel.visible = true;

      reticle.matrix.decompose(
        newModel.position,
        newModel.quaternion,
        newModel.scale
      );

      const scaleFactor = MODELS[index].scale;
      newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

      scene.add(newModel);
    }
  };

  return (
    <div className="App">
      <canvas ref={canvasRef} id="canvas" />

      {/* Model Selection Navbar */}
      <div className="navbar">
        {MODELS.map((model, index) => (
          <div
            key={index}
            id={`item${index}`}
            className={`button-item ${selectedIndex === index ? "clicked" : ""} ${isDragging && selectedIndex === index ? "dragging" : ""}`}
            onClick={() => handleModelClick(index)}
            onMouseDown={(e) => handleDragStart(e, index)}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, index)}
            onTouchEnd={handleTouchEnd}
            onBeforeXRSelect={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="model-preview">{model.name}</div>
            {!modelsLoaded && <div className="loading-indicator">Loading...</div>}
          </div>
        ))}
      </div>

      {/* Drag indicator */}
      {isDragging && (
        <div className="drag-indicator">
          Release to place {MODELS[selectedIndex].name}
        </div>
      )}

      {/* Instructions overlay */}
      {isARActive && (
        <div className="ar-instructions">
          Tap a model below, then tap where the ring appears to place it
        </div>
      )}
    </div>
  );
}

export default App;
