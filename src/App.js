import "./App.css";
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";

function App() {
  const canvasRef = useRef(null);
  const [itemSelectedIndex, setItemSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [models, setModels] = useState([
    "./dylan_armchair_yolk_yellow.glb",
    "./ivan_armchair_mineral_blue.glb",
    "./marble_coffee_table.glb",
    "./flippa_functional_coffee_table_w._storagewalnut.glb",
    "./frame_armchairpetrol_velvet_with_gold_frame.glb",
    "./elnaz_nesting_side_tables_brass__green_marble.glb",
  ]);
  const [modelScaleFactor, setModelScaleFactor] = useState([0.01, 0.01, 0.005, 0.01, 0.01, 0.01]);
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Three.js refs
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const reticleRef = useRef(null);
  const itemsRef = useRef([]);
  const controllerRef = useRef(null);
  const hitTestSourceRef = useRef(null);
  const hitTestSourceRequestedRef = useRef(false);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Placeholder images for navbar (we'll use colored boxes as placeholders)
  const modelNames = [
    "Dylan Armchair",
    "Ivan Armchair",
    "Marble Table",
    "Flippa Table",
    "Frame Armchair",
    "Elnaz Tables"
  ];

  const placeModel = useCallback((index, matrix) => {
    const item = itemsRef.current[index];
    if (!item) return;

    let newModel = item.clone();
    newModel.visible = true;

    if (matrix) {
      // Place at reticle position (AR mode)
      matrix.decompose(
        newModel.position,
        newModel.quaternion,
        newModel.scale
      );
    } else {
      // Place at origin if no matrix provided
      newModel.position.set(0, 0, -2);
    }

    let scaleFactor = modelScaleFactor[index];
    newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

    sceneRef.current.add(newModel);
  }, [modelScaleFactor]);

  const onSelect = useCallback(() => {
    const reticle = reticleRef.current;
    if (reticle && reticle.visible) {
      placeModel(itemSelectedIndex, reticle.matrix);
    }
  }, [itemSelectedIndex, placeModel]);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    cameraRef.current = camera;

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
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

    // Load models
    models.forEach((modelPath, i) => {
      const loader = new GLTFLoader();
      loader.load(modelPath, function (glb) {
        itemsRef.current[i] = glb.scene;
      });
    });

    // Controller for AR
    const controller = renderer.xr.getController(0);
    controller.addEventListener("select", onSelect);
    scene.add(controller);
    controllerRef.current = controller;

    // Reticle
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Animation loop
    renderer.setAnimationLoop(render);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.removeChild(arButton);
      renderer.dispose();
    };
  }, [models, onSelect]);

  function render(timestamp, frame) {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const reticle = reticleRef.current;

    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();

      if (hitTestSourceRequestedRef.current === false) {
        session.requestReferenceSpace("viewer").then(function (referenceSpace) {
          session
            .requestHitTestSource({ space: referenceSpace })
            .then(function (source) {
              hitTestSourceRef.current = source;
            });
        });

        session.addEventListener("end", function () {
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
  }

  // Handle drag start from navbar
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/html", index.toString());
  };

  // Handle drag over canvas
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  // Handle drop on canvas
  const handleDrop = (e) => {
    e.preventDefault();

    if (draggedIndex === null) return;

    // Check if in AR mode
    const isARMode = rendererRef.current && rendererRef.current.xr.isPresenting;

    if (!isARMode) {
      // In non-AR mode, use raycasting to place at mouse position
      const rect = canvasRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      mouseRef.current.x = x;
      mouseRef.current.y = y;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      // Create a ground plane for placement
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectPoint = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(groundPlane, intersectPoint);

      if (intersectPoint) {
        const item = itemsRef.current[draggedIndex];
        if (item) {
          let newModel = item.clone();
          newModel.visible = true;
          newModel.position.copy(intersectPoint);

          let scaleFactor = modelScaleFactor[draggedIndex];
          newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

          sceneRef.current.add(newModel);
        }
      }
    }

    setDraggedIndex(null);
  };

  // Handle model source change
  const handleModelSourceChange = (index, newSource) => {
    const newModels = [...models];
    newModels[index] = newSource;
    setModels(newModels);

    // Reload the model
    const loader = new GLTFLoader();
    loader.load(newSource, function (glb) {
      itemsRef.current[index] = glb.scene;
    }, undefined, function (error) {
      console.error('Error loading model:', error);
      alert('Failed to load model. Please check the path.');
    });
  };

  // Handle scale factor change
  const handleScaleChange = (index, newScale) => {
    const newScales = [...modelScaleFactor];
    newScales[index] = parseFloat(newScale);
    setModelScaleFactor(newScales);
  };

  return (
    <div className="App">
      <canvas
        ref={canvasRef}
        id="canvas"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />

      <div className="navbar">
        {models.map((model, index) => (
          <div
            key={index}
            id={`item${index}`}
            className={`button-item ${itemSelectedIndex === index ? 'clicked' : ''}`}
            draggable="true"
            onDragStart={(e) => handleDragStart(e, index)}
            onClick={() => setItemSelectedIndex(index)}
          >
            <div className="model-preview">
              {modelNames[index]}
            </div>
          </div>
        ))}
      </div>

      <button
        className="settings-button"
        onClick={() => setShowSettings(!showSettings)}
      >
        ⚙️
      </button>

      {showSettings && (
        <div className="settings-modal">
          <div className="settings-content">
            <h2>Model Settings</h2>
            <button
              className="close-button"
              onClick={() => setShowSettings(false)}
            >
              ✕
            </button>

            <div className="settings-list">
              {models.map((model, index) => (
                <div key={index} className="setting-item">
                  <h3>{modelNames[index]}</h3>
                  <div className="setting-row">
                    <label>Model Path:</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => handleModelSourceChange(index, e.target.value)}
                      placeholder="./model.glb"
                    />
                  </div>
                  <div className="setting-row">
                    <label>Scale Factor:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={modelScaleFactor[index]}
                      onChange={(e) => handleScaleChange(index, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
