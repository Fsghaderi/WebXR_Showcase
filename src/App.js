import "./App.css";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const MODELS = [
  {
    path: "./Fort.glb",
    name: "Log Fort",
    scale: 0.01,
    iosScale: "0.5 0.5 0.5"
  },
  {
    path: "./Log_Mash.glb",
    name: "Log Mash",
    scale: 0.01,
    iosScale: "0.5 0.5 0.5"
  },
  {
    path: "./Stumpville_House.glb",
    name: "Stumpville",
    scale: 0.01,
    iosScale: "0.5 0.5 0.5"
  },
];

// Detect device and browser info
const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge/.test(ua);
  const isMobile = isIOS || isAndroid;

  return { isIOS, isAndroid, isSafari, isChrome, isMobile };
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
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isARActive, setIsARActive] = useState(false);
  const [arSupported, setArSupported] = useState(null);
  const [deviceInfo] = useState(getDeviceInfo());

  // Store selected index in a ref so event handlers can access current value
  const selectedIndexRef = useRef(selectedIndex);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Check WebXR support (for Android)
  useEffect(() => {
    const checkARSupport = async () => {
      // iOS uses model-viewer, not WebXR
      if (deviceInfo.isIOS) {
        setArSupported(false); // WebXR not supported, but we'll use model-viewer
        return;
      }

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
  }, [deviceInfo.isIOS]);

  // Three.js setup (for non-iOS or when WebXR is available)
  useEffect(() => {
    // Skip Three.js setup on iOS - we'll use model-viewer instead
    if (deviceInfo.isIOS) {
      setModelsLoaded(true); // Models will be loaded by model-viewer
      return;
    }

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

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

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

    // OrbitControls for non-AR viewing
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Ground plane and grid
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3436,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(20, 20, 0x667eea, 0x444444);
    scene.add(gridHelper);

    // XR Estimated Light
    const xrLight = new XREstimatedLight(renderer);
    xrLight.addEventListener("estimationstart", () => {
      scene.add(xrLight);
      scene.remove(light);
      scene.background = null;
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

    // AR Button (only for supported devices)
    let arButton = null;
    if (arSupported) {
      arButton = ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "light-estimation"],
        domOverlay: { root: document.body },
      });
      arButton.style.bottom = "20%";
      document.body.appendChild(arButton);

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

    // Reticle
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
      } else {
        controls.update();
      }

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(render);

    // Window resize
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
  }, [arSupported, deviceInfo.isIOS]);

  // Handle model selection
  const handleModelClick = (index) => {
    setSelectedIndex(index);

    // For non-iOS, place preview model in Three.js scene
    if (!deviceInfo.isIOS && !isARActive && modelsLoaded) {
      const items = itemsRef.current;
      const scene = sceneRef.current;

      if (items[index] && scene) {
        const toRemove = [];
        scene.traverse((child) => {
          if (child.userData.isPreview) {
            toRemove.push(child);
          }
        });
        toRemove.forEach((obj) => scene.remove(obj));

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

  // Render iOS version with model-viewer
  if (deviceInfo.isIOS) {
    return (
      <div className="App ios-app">
        {/* iOS Header */}
        <div className="ios-header">
          <h2>Bienenstock Natural Playgrounds</h2>
          <p>Tap a model below, then tap "View in AR" to see it in your space</p>
        </div>

        {/* Model Viewer for iOS */}
        <div className="model-viewer-container">
          <model-viewer
            key={selectedIndex}
            src={MODELS[selectedIndex].path}
            alt={MODELS[selectedIndex].name}
            ar
            ar-modes="webxr scene-viewer quick-look"
            camera-controls
            touch-action="pan-y"
            auto-rotate
            shadow-intensity="1"
            environment-image="neutral"
            exposure="1"
            style={{ width: '100%', height: '100%' }}
          >
            <button slot="ar-button" className="ar-button-ios">
              View in AR
            </button>
          </model-viewer>
        </div>

        {/* Model Selection */}
        <div className="navbar">
          {MODELS.map((model, index) => (
            <div
              key={index}
              className={`button-item ${selectedIndex === index ? "clicked" : ""}`}
              onClick={() => handleModelClick(index)}
            >
              <div className="model-preview">{model.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Render Android/Desktop version with Three.js + WebXR
  return (
    <div className="App">
      {/* AR Not Supported Banner (for non-iOS devices without WebXR) */}
      {!arSupported && arSupported !== null && !deviceInfo.isIOS && (
        <div className="ar-not-supported">
          <h3>AR Not Available</h3>
          <p>Your device doesn't support WebXR AR. You can still preview 3D models below.</p>
          <p className="tip">Tip: For AR, use an Android phone with Google Chrome.</p>
        </div>
      )}

      {/* Loading indicator */}
      {arSupported === null && (
        <div className="checking-ar">
          Checking AR support...
        </div>
      )}

      <canvas ref={canvasRef} id="canvas" />

      {/* Instructions */}
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
            className={`button-item ${selectedIndex === index ? "clicked" : ""}`}
            onClick={() => handleModelClick(index)}
          >
            <div className="model-preview">{model.name}</div>
            {!modelsLoaded && <div className="loading-indicator">Loading...</div>}
          </div>
        ))}
      </div>

      {/* AR Instructions */}
      {isARActive && (
        <div className="ar-instructions">
          Tap a model below, then tap where the ring appears to place it
        </div>
      )}
    </div>
  );
}

export default App;
