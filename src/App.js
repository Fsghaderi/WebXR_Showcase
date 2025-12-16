import "./App.css";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const MODELS = [
  { path: "./Fort.glb", name: "Log Fort", scale: 0.01 },
  { path: "./Log_Mash.glb", name: "Log Mash", scale: 0.01 },
  { path: "./Stumpville_House.glb", name: "Stumpville", scale: 0.01 },
];

// Detect device and browser info
const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isChrome = /Chrome/.test(ua);
  const isFirefox = /Firefox/.test(ua);

  return { isIOS, isAndroid, isSafari, isChrome, isFirefox };
};

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
  const controlsRef = useRef(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isARActive, setIsARActive] = useState(false);
  const [arSupported, setArSupported] = useState(null); // null = checking, true = supported, false = not supported
  const [deviceInfo] = useState(getDeviceInfo());

  // Store selected index in a ref so event handlers can access current value
  const selectedIndexRef = useRef(selectedIndex);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Check WebXR support
  useEffect(() => {
    const checkARSupport = async () => {
      if (!navigator.xr) {
        setArSupported(false);
        return;
      }

      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        setArSupported(supported);
      } catch (e) {
        console.error('Error checking AR support:', e);
        setArSupported(false);
      }
    };

    checkARSupport();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    );
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;

    // Lighting
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // Add ambient light for better visibility
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // Add directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

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

    // Add OrbitControls for non-AR viewing
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Add a ground plane for non-AR mode
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3436,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x667eea, 0x444444);
    scene.add(gridHelper);

    // XR Estimated Light (only used in AR mode)
    const xrLight = new XREstimatedLight(renderer);
    xrLight.addEventListener("estimationstart", () => {
      scene.add(xrLight);
      scene.remove(light);
      scene.background = null; // Transparent for AR
      ground.visible = false;
      gridHelper.visible = false;
      if (xrLight.environment) {
        scene.environment = xrLight.environment;
      }
    });

    xrLight.addEventListener("estimationend", () => {
      scene.add(light);
      scene.remove(xrLight);
      scene.background = new THREE.Color(0x1a1a2e);
      ground.visible = true;
      gridHelper.visible = true;
    });

    // AR Button - only create if AR is supported
    let arButton = null;
    if (arSupported) {
      arButton = ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "light-estimation"],
        domOverlay: { root: document.body },
      });
      arButton.style.bottom = "20%";
      document.body.appendChild(arButton);

      // Track AR session state
      renderer.xr.addEventListener("sessionstart", () => {
        setIsARActive(true);
        controls.enabled = false;
      });
      renderer.xr.addEventListener("sessionend", () => {
        setIsARActive(false);
        controls.enabled = true;
        scene.background = new THREE.Color(0x1a1a2e);
        ground.visible = true;
        gridHelper.visible = true;
      });
    }

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
        // AR mode rendering
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
      } else {
        // Non-AR mode - update orbit controls
        controls.update();
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
      if (arButton && arButton.parentNode) {
        arButton.parentNode.removeChild(arButton);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, [arSupported]);

  // Handle model selection - also place in 3D view for non-AR mode
  const handleModelClick = (index) => {
    setSelectedIndex(index);

    // In non-AR mode, place the model in the scene for preview
    if (!isARActive && modelsLoaded) {
      const items = itemsRef.current;
      const scene = sceneRef.current;

      if (items[index] && scene) {
        // Clear previous preview models (keep ground and grid)
        const toRemove = [];
        scene.traverse((child) => {
          if (child.userData.isPreview) {
            toRemove.push(child);
          }
        });
        toRemove.forEach((obj) => scene.remove(obj));

        // Add new preview model
        const newModel = items[index].clone();
        newModel.userData.isPreview = true;
        newModel.visible = true;
        newModel.position.set(0, 0, 0);

        const scaleFactor = MODELS[index].scale;
        newModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

        scene.add(newModel);
      }
    }
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

  // Get helpful message for unsupported devices
  const getUnsupportedMessage = () => {
    if (deviceInfo.isIOS) {
      return {
        title: "iOS Device Detected",
        message: "WebXR AR is not fully supported on iOS Safari. For the best AR experience, please use an Android device with Chrome. You can still preview 3D models below.",
        tip: "Tip: On iOS, you can view models in 3D but AR placement requires Android + Chrome."
      };
    }
    if (deviceInfo.isAndroid && !deviceInfo.isChrome) {
      return {
        title: "Please Use Chrome",
        message: "WebXR AR works best in Google Chrome on Android. Please open this page in Chrome for the full AR experience.",
        tip: "Tip: Copy this URL and paste it in Google Chrome."
      };
    }
    return {
      title: "AR Not Available",
      message: "Your device or browser doesn't support WebXR AR. You can still preview 3D models in the viewer below.",
      tip: "Tip: For AR, use an Android phone with Google Chrome and ARCore support."
    };
  };

  const unsupportedInfo = !arSupported && arSupported !== null ? getUnsupportedMessage() : null;

  return (
    <div className="App">
      {/* AR Not Supported Banner */}
      {unsupportedInfo && (
        <div className="ar-not-supported">
          <h3>{unsupportedInfo.title}</h3>
          <p>{unsupportedInfo.message}</p>
          <p className="tip">{unsupportedInfo.tip}</p>
        </div>
      )}

      {/* Loading indicator */}
      {arSupported === null && (
        <div className="checking-ar">
          Checking AR support...
        </div>
      )}

      <canvas ref={canvasRef} id="canvas" />

      {/* 3D View Instructions (non-AR mode) */}
      {!isARActive && arSupported !== null && (
        <div className="view-instructions">
          {arSupported
            ? "Tap 'Enter AR' to place models in your space, or tap a model below to preview"
            : "Tap a model below to preview in 3D. Drag to rotate the view."
          }
        </div>
      )}

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
      {isDragging && isARActive && (
        <div className="drag-indicator">
          Release to place {MODELS[selectedIndex].name}
        </div>
      )}

      {/* AR Instructions overlay */}
      {isARActive && (
        <div className="ar-instructions">
          Tap a model below, then tap where the ring appears to place it
        </div>
      )}
    </div>
  );
}

export default App;
