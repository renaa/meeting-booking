import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import styles from "./FloorPlan.module.css";

interface Room  { name: string; color: number; }
interface Floor { id: string; label: string; wallColor: number; rooms: Room[]; }

const FLOORS: Floor[] = [
  {
    id: "_w2", label: "Floor 2", wallColor: 0x8a9ba8,
    rooms: [
      { name: "ALFA",    color: 0xCD5C5C },
      { name: "BETA",    color: 0x556B2F },
      { name: "VEGA",    color: 0x4682B4 },
      { name: "EPSILON", color: 0xD2691E },
      { name: "SIRIUS",  color: 0xF0E68C },
      { name: "WOLF",    color: 0x9370DB },
    ],
  },
  {
    id: "_w3", label: "Floor 3", wallColor: 0x8a9ba8,
    rooms: [
      { name: "HUBBLE",       color: 0xCD5C5C },
      { name: "WEBB",         color: 0x556B2F },
      { name: "NEW_HORIZONS", color: 0x4682B4 },
      { name: "SKYLAB",       color: 0xD2691E },
      { name: "ORION",        color: 0xF0E68C },
    ],
  },
  {
    id: "_w4", label: "Floor 4", wallColor: 0x8a9ba8,
    rooms: [
      { name: "GRAVITY",       color: 0x9370DB },
      { name: "THE_HITCHIKER", color: 0xCD5C5C },
      { name: "INTERSTELLAR",  color: 0x556B2F },
      { name: "STAR_WARS",     color: 0x4682B4 },
    ],
  },
  {
    id: "_W5", label: "Floor 5", wallColor: 0x8a9ba8,
    rooms: [
      { name: "METAL",   color: 0x7f8c8d },
      { name: "WOOL",    color: 0xf5f5dc },
      { name: "TERRAZO", color: 0x95a5a6 },
      { name: "LEATHER", color: 0xc27c0e },
    ],
  },
];

const SPREAD = 40;
const EDGE_MAT = new THREE.LineBasicMaterial({ color: 0x1a1a1a });

function meshColor(obj: THREE.Object3D): number {
  for (let n: THREE.Object3D | null = obj; n; n = n.parent) {
    const name = n.name;
    for (const f of FLOORS) {
      if (name === f.id) return f.wallColor;
      const r = f.rooms.find(room => room.name === name);
      if (r) return r.color;
    }
  }
  return 0x8a9ba8;
}

function applyRoomMaterial(mesh: THREE.Mesh) {
  mesh.material = new THREE.MeshStandardMaterial({
    color: meshColor(mesh),
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), EDGE_MAT));
}

export default function FloorPlan() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const selectedFloorRef = useRef<string | null>(null);
  const floorGroupsRef = useRef<Map<string, THREE.Group>>(new Map());

  const handleFloorClick = (floorId: string) => {
    const next = selectedFloorRef.current === floorId ? null : floorId;
    selectedFloorRef.current = next;
    setSelectedFloor(next);
  };

  useEffect(() => {
    const mount = mountRef.current!;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const frustum = 20;
    const camera = new THREE.OrthographicCamera(
      -frustum * (w / h), frustum * (w / h), frustum, -frustum, 0.1, 1000,
    );
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(15, 30, 20);
    scene.add(sun);

    const loader = new GLTFLoader();
    loader.load("/nova-house-extruded.glb", (gltf) => {
      // Dump all named objects so we can verify names match FLOORS
      console.group("GLB objects");
      gltf.scene.traverse(o => { if (o.name) console.log(o.type, JSON.stringify(o.name)); });
      console.groupEnd();

      // Apply materials while everything is still in the original hierarchy
      // so the parent-chain colour lookup works correctly.
      gltf.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) applyRoomMaterial(obj);
        else if (obj instanceof THREE.Line)
          (obj as THREE.Line).material = new THREE.LineBasicMaterial({ color: 0x444444 });
      });

      // Build one Group per floor, then attach the wall group and every room group
      // into it. `attach` preserves world transform, so colours / positions stay
      // correct even though the parent changes.
      // `getObjectByName` searches recursively — it finds rooms that are nested
      // inside a wall group just as well as rooms that are top-level siblings.
      // If a room was already moved (because it was a child of the wall group),
      // getObjectByName returns null and the `if` below skips it safely.
      FLOORS.forEach((floorDef) => {
        const group = new THREE.Group();
        scene.add(group);
        floorGroupsRef.current.set(floorDef.id, group);

        const wall = gltf.scene.getObjectByName(floorDef.id);
        if (wall) group.attach(wall);

        floorDef.rooms.forEach(r => {
          const room = gltf.scene.getObjectByName(r.name);
          if (room) group.attach(room);
        });
      });

      const box = new THREE.Box3().setFromObject(scene);
      const centre = box.getCenter(new THREE.Vector3());
      controls.target.copy(centre);
      camera.lookAt(centre);
      controls.update();
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    mount.addEventListener("click", (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find(h => h.object instanceof THREE.Mesh);
      if (hit) console.log("Room:", hit.object.name, "| Floor:", hit.object.parent?.name);
    });

    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);

      const sel = selectedFloorRef.current;
      const selIdx = sel ? FLOORS.findIndex(f => f.id === sel) : -1;

      floorGroupsRef.current.forEach((group, floorId) => {
        const idx = FLOORS.findIndex(f => f.id === floorId);
        const targetY = sel ? (idx - selIdx) * SPREAD : 0;
        group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.08);
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeading}>Building</div>

        {FLOORS.map((floor) => {
          const active = selectedFloor === floor.id;
          return (
            <div key={floor.id}>
              <button
                type="button"
                onClick={() => handleFloorClick(floor.id)}
                className={`${styles.floorButton} ${active ? styles.active : ""}`}
              >
                <span className={`${styles.floorDot} ${active ? styles.active : ""}`} />
                {floor.label}
                <span className={styles.floorChevron}>{active ? "▲" : "▼"}</span>
              </button>

              {active && (
                <div className={styles.roomList}>
                  {floor.rooms.map((room) => (
                    <div key={room.name} className={styles.roomItem}>
                      <span
                        className={styles.roomSwatch}
                        style={{ background: `#${room.color.toString(16).padStart(6, "0")}` }}
                      />
                      {room.name.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div ref={mountRef} className={styles.viewport} />
    </div>
  );
}
