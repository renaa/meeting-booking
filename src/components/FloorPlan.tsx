import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// One colour per floor, keyed by the _wN group name (case-insensitive).
// Add or change entries here as you add floors in Blender.
const FLOOR_PALETTE: Record<string, number> = {
  _w2: 0xe8735a, // floor 2 — coral
  _w3: 0x4a9e8a, // floor 3 — teal
  _w4: 0xd4a84b, // floor 4 — gold
  _w5: 0x7b6eb0, // floor 5 — lavender
};
const FALLBACK_COLOR = 0x8a9ba8;

// Walk the parent chain to find the nearest _wN ancestor and return its colour.
function floorColor(obj: THREE.Object3D): number {
  let node: THREE.Object3D | null = obj;
  while (node) {
    const color = FLOOR_PALETTE[node.name.toLowerCase()];
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
