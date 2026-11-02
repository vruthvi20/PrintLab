import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RotateCw, Maximize2, Eye, Box, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { ModelDimensions } from '../types';

interface ModelViewerProps {
  geometry: THREE.BufferGeometry | null;
  dimensions?: ModelDimensions;
  color?: string;
  wireframe?: boolean;
  scale?: number;
  rotation?: { x: number; y: number; z: number };
  showBuildVolume?: boolean;
  onScaleChange?: (scale: number) => void;
  onRotationChange?: (rotation: { x: number; y: number; z: number }) => void;
  onAutoRotateToFit?: () => void;
  onScaleToFit?: () => void;
  canFitWithRotation?: boolean;
  scaleToFitFactor?: number;
  isOversized?: boolean;
  className?: string;
  readOnly?: boolean;
}

export const ModelViewer: React.FC<ModelViewerProps> = ({
  geometry,
  dimensions,
  color = '#0d9488', // Default teal
  wireframe: initialWireframe = false,
  scale = 1,
  rotation = { x: 0, y: 0, z: 0 },
  showBuildVolume = true,
  onScaleChange,
  onAutoRotateToFit,
  onScaleToFit,
  canFitWithRotation,
  scaleToFitFactor,
  isOversized = false,
  className = '',
  readOnly = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [wireframeMode, setWireframeMode] = useState(initialWireframe);
  const [buildVolumeVisible, setBuildVolumeVisible] = useState(showBuildVolume);
  const [isRotating, setIsRotating] = useState(false);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const modelMeshRef = useRef<THREE.Mesh | null>(null);
  const buildCubeRef = useRef<THREE.LineSegments | null>(null);
  const buildPlateRef = useRef<THREE.Mesh | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});

  // Update color and wireframe of model
  useEffect(() => {
    if (modelMeshRef.current) {
      const mat = modelMeshRef.current.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.color.set(isOversized ? '#ef4444' : color);
        mat.wireframe = wireframeMode;
        mat.roughness = 0.35;
        mat.metalness = 0.15;
        mat.needsUpdate = true;
      }
      requestRenderRef.current();
    }
  }, [color, wireframeMode, isOversized]);

  // Update scale and rotation
  useEffect(() => {
    if (meshGroupRef.current) {
      meshGroupRef.current.scale.set(scale, scale, scale);
      meshGroupRef.current.rotation.set(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180
      );
      requestRenderRef.current();
    }
  }, [scale, rotation]);

  // Update build volume color depending on oversize status
  useEffect(() => {
    if (buildCubeRef.current) {
      buildCubeRef.current.visible = buildVolumeVisible;
      const mat = buildCubeRef.current.material as THREE.LineBasicMaterial;
      if (mat) {
        mat.color.set(isOversized ? '#ef4444' : '#0ea5e9');
        mat.opacity = isOversized ? 0.9 : 0.4;
      }
      requestRenderRef.current();
    }
  }, [buildVolumeVisible, isOversized]);

  // Main Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL to adapt quality
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 340;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#f8fafc'); // Slate-50

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 1, 2000);
    camera.position.set(220, 260, 300);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. Studio Environment Lighting
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Key Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(150, 300, 150);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 800;
      keyLight.shadow.camera.left = -150;
      keyLight.shadow.camera.right = 150;
      keyLight.shadow.camera.top = 150;
      keyLight.shadow.camera.bottom = -150;
    }
    scene.add(keyLight);

    // Fill & Rim Light
    const fillLight = new THREE.HemisphereLight(0xfff8f0, 0x1e293b, 1.2);
    scene.add(fillLight);

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't dip below bed
    controls.minDistance = 60;
    controls.maxDistance = 650;
    controls.target.set(0, 45, 0);
    controlsRef.current = controls;

    // 6. Build Plate (Bambu Lab A1 mini - 180 x 180 mm)
    const plateWidth = 180;
    const plateDepth = 180;

    // Textured plate canvas for authentic Bambu A1 mini bed
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Plate background (dark textured charcoal)
      ctx.fillStyle = '#1e242b';
      ctx.fillRect(0, 0, 1024, 1024);

      // Plate border
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 8;
      ctx.strokeRect(16, 16, 992, 992);

      // Grid lines: 18 divisions = 10mm each
      const step = 1024 / 18;
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 18; i++) {
        const pos = i * step;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, 1024);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(1024, pos);
        ctx.stroke();
      }

      // Major grid lines (every 50mm approx)
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 18; i += 5) {
        const pos = i * step;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, 1024);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(1024, pos);
        ctx.stroke();
      }

      // Bambu Lab A1 mini branding text
      ctx.fillStyle = '#0d9488';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Bambu Lab A1 mini', 512, 60);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px sans-serif';
      ctx.fillText('STEAM LAB PRINT BED  •  180 × 180 mm', 512, 980);

      // Origin point mark
      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.arc(512, 512, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    const plateTexture = new THREE.CanvasTexture(canvas);
    plateTexture.colorSpace = THREE.SRGBColorSpace;
    plateTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plateGeo = new THREE.BoxGeometry(plateWidth, 4, plateDepth);
    const plateMat = new THREE.MeshStandardMaterial({
      map: plateTexture,
      roughness: 0.6,
      metalness: 0.3,
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(0, -2, 0);
    plateMesh.receiveShadow = !isSoftwareGl;
    scene.add(plateMesh);
    buildPlateRef.current = plateMesh;

    // Contact shadow plane directly beneath bed
    const shadowGeo = new THREE.PlaneGeometry(240, 240);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -4.1;
    scene.add(shadowMesh);

    // 7. Transparent 180 x 180 x 180 mm Build Volume Cage
    const cubeGeo = new THREE.BoxGeometry(180, 180, 180);
    const edgesGeo = new THREE.EdgesGeometry(cubeGeo);
    const cubeMat = new THREE.LineBasicMaterial({
      color: isOversized ? 0xef4444 : 0x0ea5e9,
      transparent: true,
      opacity: 0.45,
      linewidth: 2,
    });
    const buildCube = new THREE.LineSegments(edgesGeo, cubeMat);
    buildCube.position.set(0, 90, 0);
    scene.add(buildCube);
    buildCubeRef.current = buildCube;

    // 8. Model Group
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Render loop coordinator (On-demand rendering for peak performance)
    let renderBusy = false;
    let renderDirty = false;
    let frameId = 0;

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        renderBusy = false;
        if (renderDirty) requestRender();
      });
    };
    requestRenderRef.current = requestRender;

    controls.addEventListener('change', requestRender);

    // Handle Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
      requestRender();
    };

    window.addEventListener('resize', handleResize);
    requestRender();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update geometry inside scene
  useEffect(() => {
    const meshGroup = meshGroupRef.current;
    if (!meshGroup) return;

    // Clear existing model mesh
    while (meshGroup.children.length > 0) {
      const obj = meshGroup.children[0];
      meshGroup.remove(obj);
      if ((obj as THREE.Mesh).isMesh) {
        ((obj as THREE.Mesh).material as THREE.Material).dispose();
      }
    }

    if (!geometry) {
      modelMeshRef.current = null;
      requestRenderRef.current();
      return;
    }

    // Material with high PBR fidelity
    const material = new THREE.MeshStandardMaterial({
      color: isOversized ? '#ef4444' : color,
      roughness: 0.35,
      metalness: 0.15,
      wireframe: wireframeMode,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshGroup.add(mesh);
    modelMeshRef.current = mesh;

    // Apply scale and rotation
    meshGroup.scale.set(scale, scale, scale);
    meshGroup.rotation.set(
      (rotation.x * Math.PI) / 180,
      (rotation.y * Math.PI) / 180,
      (rotation.z * Math.PI) / 180
    );

    // Auto-frame camera to fit
    if (cameraRef.current && controlsRef.current) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox || new THREE.Box3();
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetDist = Math.max(160, maxDim * 2.2);
      
      controlsRef.current.target.set(0, Math.max(20, size.y / 2), 0);
      cameraRef.current.position.set(targetDist * 0.8, targetDist * 0.9, targetDist);
      cameraRef.current.updateProjectionMatrix();
      controlsRef.current.update();
    }

    requestRenderRef.current();
  }, [geometry, color, wireframeMode, isOversized]);

  // Camera preset views
  const setCameraView = (type: 'iso' | 'top' | 'front' | 'side') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const controls = controlsRef.current;
    const camera = cameraRef.current;

    controls.target.set(0, 45, 0);

    if (type === 'iso') {
      camera.position.set(220, 240, 260);
    } else if (type === 'top') {
      camera.position.set(0, 380, 0.1);
    } else if (type === 'front') {
      camera.position.set(0, 90, 350);
    } else if (type === 'side') {
      camera.position.set(350, 90, 0);
    }
    camera.updateProjectionMatrix();
    controls.update();
    requestRenderRef.current();
  };

  const resetView = () => {
    setCameraView('iso');
  };

  return (
    <div className={`relative flex flex-col rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 ${className}`}>
      {/* 3D WebGL Canvas Container */}
      <div 
        ref={mountRef} 
        className="w-full h-80 sm:h-96 relative cursor-grab active:cursor-grabbing outline-none"
      />

      {/* Floating Status Badge (Top-Left) */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none z-10">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-sm text-xs font-medium text-slate-800">
          <Box className="w-3.5 h-3.5 text-teal-600" />
          <span>Bambu Lab A1 mini Build Bed (180 × 180 × 180 mm)</span>
        </div>

        {dimensions && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg backdrop-blur-sm shadow-sm text-xs font-semibold ${
            isOversized 
              ? 'bg-rose-50 text-rose-700 border border-rose-300' 
              : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
          }`}>
            {isOversized ? (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            <span>
              {isOversized 
                ? `Too Big: ${dimensions.x} × ${dimensions.y} × ${dimensions.z} mm`
                : `✓ Fits the A1 mini: ${dimensions.x} × ${dimensions.y} × ${dimensions.z} mm`}
            </span>
          </div>
        )}
      </div>

      {/* Camera View Angle Buttons (Top-Right) */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur-sm p-1 rounded-xl border border-slate-200/80 shadow-sm z-10">
        <button
          type="button"
          onClick={() => setCameraView('iso')}
          className="px-2 py-1 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Isometric View"
        >
          Iso
        </button>
        <button
          type="button"
          onClick={() => setCameraView('top')}
          className="px-2 py-1 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Top View"
        >
          Top
        </button>
        <button
          type="button"
          onClick={() => setCameraView('front')}
          className="px-2 py-1 text-xs font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Front View"
        >
          Front
        </button>
        <button
          type="button"
          onClick={resetView}
          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors ml-0.5"
          title="Reset Camera"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Oversize Warning & Auto-Fix Banner */}
      {isOversized && dimensions && (
        <div className="bg-rose-50 border-t border-rose-200 p-3 sm:p-4 text-rose-900 flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-rose-800">
                Too big for the Bambu A1 mini (max 180 × 180 × 180 mm)
              </p>
              <p className="text-xs text-rose-700 mt-0.5">
                Your model is <span className="font-mono font-bold">{dimensions.x} × {dimensions.y} × {dimensions.z} mm</span>.
                The red bounding box shows what sticks out of the printable area.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onScaleToFit && scaleToFitFactor && (
              <button
                type="button"
                onClick={onScaleToFit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Scale to fit ({Math.round(scaleToFitFactor * 100)}%)
              </button>
            )}

            {canFitWithRotation && onAutoRotateToFit && (
              <button
                type="button"
                onClick={onAutoRotateToFit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Auto-rotate to fit
              </button>
            )}

            <div className="text-xs text-rose-600 italic">
              💡 Tip: Split large multi-part assemblies into separate pieces in Tinkercad or Bambu Studio!
            </div>
          </div>
        </div>
      )}

      {/* Bottom Viewer Controls Bar */}
      <div className="bg-white/95 border-t border-slate-200/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={buildVolumeVisible}
              onChange={(e) => setBuildVolumeVisible(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
            />
            <span>Build Volume Cube (180mm)</span>
          </label>

          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={wireframeMode}
              onChange={(e) => setWireframeMode(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
            />
            <span>Wireframe</span>
          </label>
        </div>

        {/* Rotate and Scale Controls if not readonly */}
        {!readOnly && onScaleChange && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Scale:</span>
              <input
                type="range"
                min="0.1"
                max="2.5"
                step="0.05"
                value={scale}
                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                className="w-20 accent-teal-600 cursor-pointer"
              />
              <span className="font-mono text-xs w-10">{Math.round(scale * 100)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
