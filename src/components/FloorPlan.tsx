import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import styles from "./FloorPlan.module.css";

interface Room  { name: string; color: number; capacity: number; features: string[]; }
interface Floor { id: string; label: string; wallColor: number; rooms: Room[]; }

const FLOORS: Floor[] = [
  {
    id: "_w2", label: "Floor 2", wallColor: 0x8a9ba8,
    rooms: [
      { name: "ALFA",    color: 0xCD5C5C, capacity: 6,  features: ["Whiteboard", "Video conferencing"] },
      { name: "BETA",    color: 0x556B2F, capacity: 4,  features: ["Whiteboard"] },
      { name: "VEGA",    color: 0x4682B4, capacity: 10, features: ["Video conferencing", "Natural light", "TV screen"] },
      { name: "EPSILON", color: 0xD2691E, capacity: 8,  features: ["Whiteboard", "Phone"] },
      { name: "SIRIUS",  color: 0xF0E68C, capacity: 12, features: ["Video conferencing", "Whiteboard", "Natural light"] },
      { name: "WOLF",    color: 0x9370DB, capacity: 4,  features: ["Phone"] },
    ],
  },
  {
    id: "_w3", label: "Floor 3", wallColor: 0x8a9ba8,
    rooms: [
      { name: "HUBBLE",       color: 0xCD5C5C, capacity: 16, features: ["Video conferencing", "Whiteboard", "TV screen"] },
      { name: "WEBB",         color: 0x556B2F, capacity: 8,  features: ["Whiteboard", "Natural light"] },
      { name: "NEW_HORIZONS", color: 0x4682B4, capacity: 10, features: ["Video conferencing", "TV screen"] },
      { name: "SKYLAB",       color: 0xD2691E, capacity: 6,  features: ["Whiteboard", "Phone"] },
      { name: "ORION",        color: 0xF0E68C, capacity: 14, features: ["Video conferencing", "Natural light", "TV screen"] },
    ],
  },
  {
    id: "_w4", label: "Floor 4", wallColor: 0x8a9ba8,
    rooms: [
      { name: "GRAVITY",       color: 0x9370DB, capacity: 20, features: ["Video conferencing", "Whiteboard", "TV screen", "Natural light"] },
      { name: "THE_HITCHIKER", color: 0xCD5C5C, capacity: 6,  features: ["Whiteboard", "Phone"] },
      { name: "INTERSTELLAR",  color: 0x556B2F, capacity: 18, features: ["Video conferencing", "TV screen", "Natural light"] },
      { name: "STAR_WARS",     color: 0x4682B4, capacity: 12, features: ["Video conferencing", "Whiteboard"] },
    ],
  },
  {
    id: "_W5", label: "Floor 5", wallColor: 0x8a9ba8,
    rooms: [
      { name: "METAL",    color: 0x7f8c8d, capacity: 8,  features: ["Whiteboard", "Phone"] },
      { name: "WOOL",     color: 0xf5f5dc, capacity: 6,  features: ["Whiteboard", "Natural light"] },
      { name: "TERRAZZO", color: 0x95a5a6, capacity: 10, features: ["Video conferencing", "Natural light"] },
      { name: "LEATHER",  color: 0xc27c0e, capacity: 14, features: ["Video conferencing", "TV screen", "Whiteboard"] },
    ],
  },
];

const SPREAD   = 40;
const FRUSTUM  = 20;
const EDGE_MAT = new THREE.LineBasicMaterial({ color: 0x1a1a1a });

// ── Dummy calendar ────────────────────────────────────────────────────────────
const DAYS  = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];

function slotBooked(room: string, day: string, hour: string): boolean {
  const s = [...(room + day + hour)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return s % 3 === 0;
}

function isRoomAvailableNow(roomName: string): boolean {
  const now = new Date();
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getDay()];
  if (!DAYS.includes(day)) return true;
  const hourStr = `${String(now.getHours()).padStart(2,"0")}:00`;
  if (!HOURS.includes(hourStr)) return true;
  return !slotBooked(roomName, day, hourStr);
}

// ── Material helpers ──────────────────────────────────────────────────────────
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

function applyRoomMaterial(mesh: THREE.Mesh, polyIdx = 0) {
  mesh.material = new THREE.MeshStandardMaterial({
    color: meshColor(mesh),
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: polyIdx * 0.1,
    polygonOffsetUnits: polyIdx * 0.1,
  });
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), EDGE_MAT));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FloorPlan() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [selectedFloor,  setSelectedFloor]  = useState<string | null>(null);
  const [selectedRoom,   setSelectedRoom]   = useState<string | null>(null);
  const [activeFacility, setActiveFacility] = useState<string | null>(null);

  // Refs mirror state so the Three.js loop always reads fresh values.
  const selectedFloorRef = useRef<string | null>(null);
  const selectedRoomRef  = useRef<string | null>(null);

  const floorGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const roomObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const hoveredRoomRef = useRef<string | null>(null);
  const roomMeshesRef  = useRef<Map<string, THREE.Mesh[]>>(new Map());

  // Camera animation targets
  const camTargetRef   = useRef(new THREE.Vector3());
  const camZoomRef     = useRef(1);
  const defaultTarget  = useRef(new THREE.Vector3());
  const defaultZoom    = useRef(1);

  // Callback refs: updated every render so stale closures inside useEffect
  // always call the freshest version of the state setters.
  const onDeselectRef = useRef<() => void>(null!);
  onDeselectRef.current = () => {
    selectedRoomRef.current = null;
    setSelectedRoom(null);
    setActiveFacility(null);
  };

  const onRoomSelectRef = useRef<(floorId: string, roomName: string) => void>(null!);
  onRoomSelectRef.current = (floorId, roomName) => {
    const deselecting = selectedRoomRef.current === roomName;
    if (deselecting) {
      selectedRoomRef.current = null;
      setSelectedRoom(null);
      setActiveFacility(null);
      // keep floor selected so separation stays visible
    } else {
      // Switch floor if needed, then select room
      if (selectedFloorRef.current !== floorId) {
        selectedFloorRef.current = floorId;
        setSelectedFloor(floorId);
      }
      selectedRoomRef.current = roomName;
      setSelectedRoom(roomName);
    }
  };

  const handleFloorClick = (floorId: string) => {
    const next = selectedFloorRef.current === floorId ? null : floorId;
    selectedFloorRef.current = next;
    selectedRoomRef.current  = null;
    setSelectedFloor(next);
    setSelectedRoom(null);
  };

  useEffect(() => {
    const mount = mountRef.current!;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.OrthographicCamera(
      -FRUSTUM * (w / h), FRUSTUM * (w / h), FRUSTUM, -FRUSTUM, 1, 300,
    );
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
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

    // ── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.left   = -FRUSTUM * (w / h);
      camera.right  =  FRUSTUM * (w / h);
      camera.top    =  FRUSTUM;
      camera.bottom = -FRUSTUM;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── GLB load ─────────────────────────────────────────────────────────────
    new GLTFLoader().load("/nova-house-extruded.glb", (gltf) => {
      // Apply materials before reparenting so parent-chain colour lookup works.
      let meshIdx = 0;
      gltf.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) applyRoomMaterial(obj, meshIdx++);
        else if (obj instanceof THREE.Line)
          (obj as THREE.Line).material = new THREE.LineBasicMaterial({ color: 0x444444 });
      });

      // One THREE.Group per floor; attach wall group + all room groups into it.
      FLOORS.forEach((floorDef) => {
        const group = new THREE.Group();
        scene.add(group);
        floorGroupsRef.current.set(floorDef.id, group);

        const wall = gltf.scene.getObjectByName(floorDef.id);
        if (wall) group.attach(wall);

        floorDef.rooms.forEach(r => {
          const roomObj = gltf.scene.getObjectByName(r.name);
          if (roomObj) {
            group.attach(roomObj);
            roomObjectsRef.current.set(r.name, roomObj);
            const meshes: THREE.Mesh[] = [];
            roomObj.traverse(child => { if (child instanceof THREE.Mesh) meshes.push(child as THREE.Mesh); });
            roomMeshesRef.current.set(r.name, meshes);
          }
        });
      });

      // Fit camera to scene and store defaults for later reset.
      const box    = new THREE.Box3().setFromObject(scene);
      const centre = box.getCenter(new THREE.Vector3());
      controls.target.copy(centre);
      camera.lookAt(centre);
      controls.update();

      defaultTarget.current.copy(centre);
      defaultZoom.current = camera.zoom;
      camTargetRef.current.copy(centre);
      camZoomRef.current = camera.zoom;
    });

    // ── Raycaster – room click in 3-D viewport ────────────────────────────────
    let mdx = 0, mdy = 0;
    const raycaster = new THREE.Raycaster();
    const pointer   = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => { mdx = e.clientX; mdy = e.clientY; };
    const onClick = (e: MouseEvent) => {
      if (Math.hypot(e.clientX - mdx, e.clientY - mdy) > 4) return; // drag, not click

      const rect = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
      pointer.y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find(h => h.object instanceof THREE.Mesh);

      if (hit) {
        for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
          for (const floor of FLOORS) {
            if (floor.rooms.some(r => r.name === node!.name)) {
              onRoomSelectRef.current(floor.id, node!.name);
              return;
            }
          }
        }
      }
      // Clicked empty space — exit room selection mode
      onDeselectRef.current();
    };

    mount.addEventListener("mousedown", onMouseDown);
    mount.addEventListener("click",     onClick);

    // ── Hover detection ───────────────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons !== 0) return;
      const rect = mount.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
      pointer.y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find(h => h.object instanceof THREE.Mesh);
      let next: string | null = null;
      if (hit) {
        outer: for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
          for (const floor of FLOORS) {
            if (floor.rooms.some(r => r.name === node!.name)) { next = node!.name; break outer; }
          }
        }
      }
      hoveredRoomRef.current = next;
    };
    mount.addEventListener("mousemove",  onMouseMove);
    mount.addEventListener("mouseleave", () => { hoveredRoomRef.current = null; });

    // ── Room-effect state (local to this closure) ─────────────────────────────
    let selectionLines: LineSegments2[] = [];
    let prevSel: string | null = null;

    const clearEffects = () => {
      selectionLines.forEach(l => {
        l.parent?.remove(l);
        l.geometry.dispose();
        (l.material as LineMaterial).dispose();
      });
      selectionLines = [];
    };

    // ── Render loop ──────────────────────────────────────────────────────────
    const tmpBox    = new THREE.Box3();
    const tmpCenter = new THREE.Vector3();

    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);

      // Floor separation
      const sel    = selectedFloorRef.current;
      const selIdx = sel ? FLOORS.findIndex(f => f.id === sel) : -1;
      floorGroupsRef.current.forEach((group, floorId) => {
        const idx     = FLOORS.findIndex(f => f.id === floorId);
        const targetY = sel ? (idx - selIdx) * SPREAD : 0;
        group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.08);
      });

      // Camera fly-in: track room's live world-space centre each frame
      // (the room moves as the floor group animates, so this naturally chases it)
      const roomName = selectedRoomRef.current;
      if (roomName) {
        const roomObj = roomObjectsRef.current.get(roomName);
        if (roomObj) {
          tmpBox.setFromObject(roomObj);
          tmpBox.getCenter(tmpCenter);
          camTargetRef.current.copy(tmpCenter);

          // Zoom to fit the room with a comfortable margin
          const size   = tmpBox.getSize(new THREE.Vector3());
          const span   = Math.max(size.x, size.z) * 1.8;
          camZoomRef.current = (FRUSTUM * 2) / Math.max(span, 0.5);
        }
      } else {
        camTargetRef.current.copy(defaultTarget.current);
        camZoomRef.current = defaultZoom.current;
      }

      controls.target.lerp(camTargetRef.current, 0.06);
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, camZoomRef.current, 0.06);
      camera.updateProjectionMatrix();

      // ── Hover glow ────────────────────────────────────────────────────────
      const hovName = hoveredRoomRef.current;
      const selName = selectedRoomRef.current;
      roomMeshesRef.current.forEach((meshes, roomName) => {
        const glow = roomName === hovName && roomName !== selName;
        meshes.forEach(m => {
          const mat = m.material;
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setHex(glow ? 0x777777 : 0x000000);
            mat.emissiveIntensity = glow ? 1 : 0;
          }
        });
      });

      // ── Selection outline ─────────────────────────────────────────────────
      if (prevSel !== selName) {
        clearEffects();
        if (selName) {
          const outlineColor = isRoomAvailableNow(selName) ? 0x00cc44 : 0xff3333;
          const res = new THREE.Vector2(mount.clientWidth, mount.clientHeight);
          const meshes = roomMeshesRef.current.get(selName) ?? [];
          meshes.forEach(mesh => {
            const edges = new THREE.EdgesGeometry(mesh.geometry);
            const lineGeo = new LineSegmentsGeometry();
            lineGeo.setPositions(edges.attributes.position.array as Float32Array);
            edges.dispose();
            const lines = new LineSegments2(lineGeo, new LineMaterial({ color: outlineColor, linewidth: 12, resolution: res }));
            mesh.add(lines);
            selectionLines.push(lines);
          });
        }
        prevSel = selName;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      clearEffects();
      window.removeEventListener("resize",    onResize);
      mount.removeEventListener("mousedown",  onMouseDown);
      mount.removeEventListener("click",      onClick);
      mount.removeEventListener("mousemove",  onMouseMove);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // Derive display data from state for the drawer
  const activeFloor = FLOORS.find(f => f.id === selectedFloor);
  const activeRoom  = activeFloor?.rooms.find(r => r.name === selectedRoom);

  return (
    <div className={styles.layout}>

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeading}>Building</div>

        {FLOORS.map((floor) => {
          const floorActive = selectedFloor === floor.id;
          const showRooms   = floorActive || activeFacility !== null;
          return (
            <div key={floor.id}>
              <button
                type="button"
                onClick={() => handleFloorClick(floor.id)}
                className={`${styles.floorButton} ${floorActive ? styles.active : ""}`}
              >
                <span className={`${styles.floorDot} ${floorActive ? styles.active : ""}`} />
                {floor.label}
                <span className={styles.floorChevron}>{showRooms ? "▲" : "▼"}</span>
              </button>

              {showRooms && (
                <div className={styles.roomList}>
                  {floor.rooms.map((room) => {
                    const roomActive = selectedRoom === room.name;
                    const match = activeFacility ? room.features.includes(activeFacility) : null;
                    return (
                      <button
                        key={room.name}
                        type="button"
                        onClick={() => onRoomSelectRef.current(floor.id, room.name)}
                        className={`${styles.roomButton} ${roomActive ? styles.active : ""} ${match === true ? styles.facilityMatch : ""} ${match === false ? styles.facilityDim : ""}`}
                      >
                        <span
                          className={styles.roomSwatch}
                          style={{ "--c": `#${room.color.toString(16).padStart(6, "0")}` } as React.CSSProperties}
                        />
                        {room.name.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── 3-D viewport ─────────────────────────────────────────────────── */}
      <div ref={mountRef} className={styles.viewport} />

      {/* ── Right drawer ─────────────────────────────────────────────────── */}
      <div className={`${styles.drawer} ${activeRoom ? styles.drawerOpen : ""}`}>
        {activeRoom && activeFloor && (
          <>
            <div
              className={styles.drawerBand}
              style={{ "--c": `#${activeRoom.color.toString(16).padStart(6, "0")}` } as React.CSSProperties}
            />
            <div className={styles.drawerHeader}>
              <div>
                <div className={styles.drawerRoomName}>{activeRoom.name.replace(/_/g, " ")}</div>
                <div className={styles.drawerFloor}>{activeFloor.label}</div>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => onDeselectRef.current()}
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerBody}>
              <div className={styles.calLabel}>Availability this week</div>

              <div className={styles.calendar}>
                {/* header row */}
                <div className={styles.calRow}>
                  <div className={styles.calTime} />
                  {DAYS.map(d => <div key={d} className={styles.calDay}>{d}</div>)}
                </div>
                {/* hour rows */}
                {HOURS.map(hour => (
                  <div key={hour} className={styles.calRow}>
                    <div className={styles.calTime}>{hour}</div>
                    {DAYS.map(day => (
                      <div
                        key={day}
                        className={`${styles.calSlot} ${
                          slotBooked(activeRoom.name, day, hour) ? styles.slotBooked : styles.slotFree
                        }`}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div className={styles.legend}>
                <span className={`${styles.legendDot} ${styles.slotFree}`} /> Available
                <span className={`${styles.legendDot} ${styles.slotBooked}`} /> Booked
              </div>

              <div className={styles.metaSection}>
                <div className={styles.calLabel}>Room details</div>
                <div className={styles.metaRow}>
                  <span className={styles.metaIcon}>&#128101;</span>
                  <span className={styles.metaText}>Capacity: {activeRoom.capacity} people</span>
                </div>
                <div className={styles.metaFeatures}>
                  {activeRoom.features.map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setActiveFacility(activeFacility === f ? null : f)}
                      className={`${styles.metaChip} ${activeFacility === f ? styles.metaChipActive : ""}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
