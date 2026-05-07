import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// One colour per floor, keyed by the _wN group name (case-insensitive).
// Add or change entries here as you add floors in Blender.
const FLOOR_PALETTE: Record<string, number> = {
  // exterior walls
  _w2: 0x8a9ba8, 
  _w3: 0x8a9ba8, 
  _w4: 0x8a9ba8, 
  _w5: 0x8a9ba8, 

  // floor 2 rooms
  ALFA:  0xCD5C5C,
  BETA: 0x556B2F,
  VEGA: 0x4682B4,
  EPSILON: 0xD2691E,
  SIRIUS: 0xF0E68C ,  
  WOLF: 0x9370DB,  

  // floor 3 rooms
  HUBBLE : 0xCD5C5C,
  WEBB:  0x556B2F,
  NEW_HORIZONS: 0x4682B4,
  SKYLAB: 0xD2691E,
  ORION:  0xF0E68C, 

  // floor 4 rooms
  GRAVITY: 0x9370DB, 
  THE_HITCHIKER : 0xCD5C5C, 
  INTERSTELLAR : 0x556B2F, 
  STAR_WARS : 0x4682B4, 

  // floor 5 rooms
  METAL: 0x7f8c8d,  
  WOOL:   0xf5f5dc,
  TERRAZO: 0x95a5a6,
  LEATHER: 0xc27c0e,
};
const FALLBACK_COLOR = 0x8a9ba8;

// Walk the parent chain to find the nearest _wN ancestor and return its colour.
function floorColor(obj: THREE.Object3D): number {
  let node: THREE.Object3D | null = obj;
  while (node) {
    const color = FLOOR_PALETTE[node.name];
    
    console.log(node.name, color);
    if (color !== undefined) return color;
    node = node.parent;
  }
  return FALLBACK_COLOR;
}

const EDGE_MAT = new THREE.LineBasicMaterial({ color: 0x1a1a1a });

// Apply a floor-tinted standard material to a mesh and add an edge overlay.
// Works for both flat planes (current GLB) and pre-extruded 3D geometry from Blender.
function applyRoomMaterial(mesh: THREE.Mesh) {
  mesh.material = new THREE.MeshStandardMaterial({
    color: floorColor(mesh),
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), EDGE_MAT));
}

// Make any Line/LineSegments exported from Blender visible with a neutral material.
// Once you pre-extrude walls this will become dead code, but costs nothing to keep.
function applyLineMaterial(line: THREE.Line) {
  (line as THREE.Line<THREE.BufferGeometry, THREE.Material>).material =
    new THREE.LineBasicMaterial({ color: 0x444444 });
}

export default function FloorPlan() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // ── Camera ───────────────────────────────────────────────────────────────
    const aspect = w / h;
    const frustum = 20;
    const camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 1000,
    );
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // ── Controls ─────────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.update();

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(15, 30, 20);
    scene.add(sun);

    // ── GLB ──────────────────────────────────────────────────────────────────
    const loader = new GLTFLoader();
    loader.load("/nova-house-extruded.glb", (gltf) => {
      // Apply materials before adding to scene so parent references are intact.
      gltf.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          applyRoomMaterial(obj);
        } else if (obj instanceof THREE.Line) {
          applyLineMaterial(obj);
        }
      });

      scene.add(gltf.scene);

      // Centre the camera on the loaded geometry.
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const centre = box.getCenter(new THREE.Vector3());
      controls.target.copy(centre);
      camera.lookAt(centre);
      controls.update();
    });

    // ── Raycaster (room picker) ───────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find((h) => h.object instanceof THREE.Mesh);
      if (hit) console.log("Room:", hit.object.name, "| Floor group:", hit.object.parent?.name);
    };
    mount.addEventListener("click", onClick);

    // ── Render loop ──────────────────────────────────────────────────────────
    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      mount.removeEventListener("click", onClick);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height: "100vh" }} />;
}
