import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function randomColor() {
  return Math.floor(Math.random() * 0xffffff);
}

function extractShapeFromFlatGeometry(geometry: THREE.BufferGeometry): THREE.Shape | null {
  const posAttr = geometry.attributes.position;
  const index = geometry.index;
  if (!posAttr || !index) return null;

  // Find boundary edges — those belonging to exactly one triangle
  const edgeMap = new Map<string, { count: number; verts: [number, number] }>();
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const v1 = tri[j], v2 = tri[(j + 1) % 3];
      const key = `${Math.min(v1, v2)}_${Math.max(v1, v2)}`;
      const entry = edgeMap.get(key);
      if (entry) entry.count++;
      else edgeMap.set(key, { count: 1, verts: [v1, v2] });
    }
  }

  const adj = new Map<number, number[]>();
  for (const { count, verts: [v1, v2] } of edgeMap.values()) {
    if (count !== 1) continue;
    adj.has(v1) ? adj.get(v1)!.push(v2) : adj.set(v1, [v2]);
    adj.has(v2) ? adj.get(v2)!.push(v1) : adj.set(v2, [v1]);
  }

  if (adj.size === 0) return null;

  // Walk the boundary loop
  const loop: number[] = [];
  const visited = new Set<number>();
  const firstKey = adj.keys().next().value;
  if (firstKey === undefined) return null;
  let cur: number = firstKey;
  while (!visited.has(cur)) {
    loop.push(cur);
    visited.add(cur);
    const next = (adj.get(cur) ?? []).find(n => !visited.has(n));
    if (next === undefined) break;
    cur = next;
  }

  if (loop.length < 3) return null;

  // Build shape in XZ plane (Z negated so rotation.x = -π/2 restores correct orientation)
  const shape = new THREE.Shape();
  loop.forEach((v, i) => {
    const x = posAttr.getX(v);
    const z = -posAttr.getZ(v);
    i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

export default function FloorPlan() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Ortho camera — top-down view
    const aspect = w / h;
    const frustum = 20;
    const camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum, 0.1, 1000
    );
    camera.position.set(30, 25, 30);
    camera.lookAt(0, 1.5, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // Controls — left=orbit, right=pan, scroll=zoom
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.5, 0);
    controls.screenSpacePanning = true;
    controls.update();

    // Light
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    // Load GLB
    const loader = new GLTFLoader();
    loader.load("/floorplan.glb", (gltf) => {
      scene.add(gltf.scene);

      // Extrude each flat mesh 3 m upward and color it
      gltf.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;

        const shape = extractShapeFromFlatGeometry(obj.geometry);
        if (shape) {
          const extruded = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false });
          extruded.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
          obj.geometry.dispose();
          obj.geometry = extruded;
        }

        obj.material = new THREE.MeshStandardMaterial({
          color: randomColor(),
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        });
      });
    });

    // Raycasting on click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / w) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / h) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0) {
        console.log("Klikket på:", hits[0].object.name);
      }
    };
    mount.addEventListener("click", onClick);

    // Animate
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      mount.removeEventListener("click", onClick);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height: "100vh" }} />;
}