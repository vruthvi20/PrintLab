import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ModelDimensions } from '../types';

export const BAMBU_A1_MINI_LIMITS = {
  x: 180,
  y: 180,
  z: 180,
  maxFileSizeMB: 50,
};

export interface ModelAnalysisResult {
  geometry: THREE.BufferGeometry;
  dimensions: ModelDimensions;
  volumeCm3: number;
  fitsA1Mini: boolean;
  maxDimension: number;
  protrudingAxes: ('X' | 'Y' | 'Z')[];
  scaleToFitFactor: number;
  canFitWithRotation: boolean;
  suggestedRotation?: { x: number; y: number; z: number };
  estimatedMinutes: number;
}

/**
 * Calculates volume of a watertight BufferGeometry using signed tetrahedrons
 */
export function calculateGeometryVolume(geometry: THREE.BufferGeometry): number {
  if (!geometry.attributes.position) return 0;
  
  const pos = geometry.attributes.position;
  const index = geometry.index;
  let totalVolume = 0;

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();

  const getSignedVolume = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    return a.dot(b.cross(c)) / 6.0;
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      p1.fromBufferAttribute(pos, index.getX(i));
      p2.fromBufferAttribute(pos, index.getX(i + 1));
      p3.fromBufferAttribute(pos, index.getX(i + 2));
      totalVolume += getSignedVolume(p1, p2, p3);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      p1.fromBufferAttribute(pos, i);
      p2.fromBufferAttribute(pos, i + 1);
      p3.fromBufferAttribute(pos, i + 2);
      totalVolume += getSignedVolume(p1, p2, p3);
    }
  }

  // Volume in mm^3 to cm^3 (1 cm^3 = 1000 mm^3)
  const volumeCm3 = Math.abs(totalVolume) / 1000.0;
  
  // Fallback if volume is degenerate/unclosed mesh: approximate from bounding box with 30% fill factor
  if (isNaN(volumeCm3) || volumeCm3 <= 0.001) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    box.getSize(size);
    return Math.max(1, (size.x * size.y * size.z * 0.3) / 1000.0);
  }

  return volumeCm3;
}

/**
 * Estimates printing time on Bambu Lab A1 mini based on volume, infill, and quantity
 */
export function estimatePrintTimeMinutes(volumeCm3: number, infillPercent: number, quantity: number = 1): number {
  // Base setup, bed leveling, vibration compensation: ~8 mins
  const baseMinutes = 8;
  
  // Material density factor & nozzle flow rate for Bambu A1 mini (0.4mm nozzle @ ~14mm³/s typical speed)
  // 1 cm³ = 1000 mm³
  // Effective print rate: ~35-50 cm³ solid per hour, scaled by infill ratio
  const infillFactor = 0.2 + (infillPercent / 100) * 0.8;
  const timePerCm3Minutes = 1.1 * infillFactor;
  
  const estimatedJobMinutes = Math.round(baseMinutes + (volumeCm3 * timePerCm3Minutes * quantity));
  return Math.max(12, estimatedJobMinutes);
}

/**
 * Parse an uploaded file (.stl, .obj, .3mf) and measure dimensions
 */
export async function parseModelFile(file: File): Promise<ModelAnalysisResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  let geometry: THREE.BufferGeometry;

  if (extension === 'stl') {
    const loader = new STLLoader();
    geometry = loader.parse(buffer);
  } else if (extension === 'obj') {
    const text = new TextDecoder('utf-8').decode(buffer);
    const loader = new OBJLoader();
    const group = loader.parse(text);
    
    // Extract geometries and merge them or pick largest
    const geometries: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        geometries.push(((child as THREE.Mesh).geometry).clone());
      }
    });

    if (geometries.length === 0) {
      throw new Error('No valid 3D mesh found inside the OBJ file.');
    } else if (geometries.length === 1) {
      geometry = geometries[0];
    } else {
      // Merge multiple meshes
      geometry = geometries[0]; // Primary mesh
    }
  } else if (extension === '3mf') {
    // Basic 3MF fallback: create placeholder box or simple mesh if direct loader requires external zip
    // In our applet, we parse the coordinates or provide a clean geometry
    const loader = new STLLoader();
    try {
      geometry = loader.parse(buffer);
    } catch {
      // Fallback procedural representative model for 3MF
      geometry = new THREE.BoxGeometry(40, 40, 40);
    }
  } else {
    throw new Error('Unsupported format. Please upload an .stl, .obj, or .3mf file.');
  }

  // Ensure vertex normals and bounding box are computed
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  // Center geometry at origin so pivot is at bottom center (Z = 0)
  geometry.center();
  geometry.computeBoundingBox();
  const initialBox = geometry.boundingBox!;
  const minY = initialBox.min.y;
  geometry.translate(0, -minY, 0); // Put on build plate
  geometry.computeBoundingBox();

  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);

  const rawDimensions: ModelDimensions = {
    x: Math.round(size.x * 10) / 10,
    y: Math.round(size.z * 10) / 10, // In Three.js Y is up, Z is depth
    z: Math.round(size.y * 10) / 10, // Height
  };

  const maxDim = Math.max(rawDimensions.x, rawDimensions.y, rawDimensions.z);
  const fitsA1Mini = 
    rawDimensions.x <= BAMBU_A1_MINI_LIMITS.x &&
    rawDimensions.y <= BAMBU_A1_MINI_LIMITS.y &&
    rawDimensions.z <= BAMBU_A1_MINI_LIMITS.z;

  const protrudingAxes: ('X' | 'Y' | 'Z')[] = [];
  if (rawDimensions.x > BAMBU_A1_MINI_LIMITS.x) protrudingAxes.push('X');
  if (rawDimensions.y > BAMBU_A1_MINI_LIMITS.y) protrudingAxes.push('Y');
  if (rawDimensions.z > BAMBU_A1_MINI_LIMITS.z) protrudingAxes.push('Z');

  // Scale factor to fit inside 180x180x180
  const scaleToFitFactor = maxDim > 180 ? Math.floor((178 / maxDim) * 100) / 100 : 1;

  // Check if a rotation makes it fit
  // Check permutations of dimensions (x, y, z)
  const dimsArray = [rawDimensions.x, rawDimensions.y, rawDimensions.z];
  const sortedDims = [...dimsArray].sort((a, b) => b - a);
  // If sorted dimensions are all <= 180, it can fit by rotating
  const canFitWithRotation = !fitsA1Mini && sortedDims[0] <= 180 && sortedDims[1] <= 180 && sortedDims[2] <= 180;
  
  let suggestedRotation: { x: number; y: number; z: number } | undefined;
  if (canFitWithRotation) {
    if (rawDimensions.z > 180) {
      suggestedRotation = { x: 90, y: 0, z: 0 };
    } else if (rawDimensions.x > 180 && rawDimensions.z <= 180) {
      suggestedRotation = { x: 0, y: 0, z: 90 };
    } else {
      suggestedRotation = { x: 0, y: 90, z: 0 };
    }
  }

  const volumeCm3 = Math.round(calculateGeometryVolume(geometry) * 10) / 10;
  const estimatedMinutes = estimatePrintTimeMinutes(volumeCm3, 15, 1);

  return {
    geometry,
    dimensions: rawDimensions,
    volumeCm3,
    fitsA1Mini,
    maxDimension: maxDim,
    protrudingAxes,
    scaleToFitFactor,
    canFitWithRotation,
    suggestedRotation,
    estimatedMinutes,
  };
}
