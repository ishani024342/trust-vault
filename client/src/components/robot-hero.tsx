/* Samvid humanoid: a procedural Three.js model with pointer tracking, blink timing, and shield glow. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

const heartPoints: THREE.Vector3[] = Array.from({ length: 96 }, (_, i) => {
  const t = (i / 96) * Math.PI * 2;
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return new THREE.Vector3(x * 0.002, (y + 6) * 0.002, 0);
});
const sharedHeartCurve = new THREE.CatmullRomCurve3(heartPoints, true);

export function GlassCapsule({ color = "#5ff0d8", power = 2.5, intensity = 0.6, radius = 0.3 }: { color?: string; power?: number; intensity?: number; radius?: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ color: { value: new THREE.Color(color) }, power: { value: power }, intensity: { value: intensity } }), []);
  useFrame(({ clock }) => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    (u.color.value as THREE.Color).set(color);
    u.power.value = power;
    u.intensity.value = intensity * (0.85 + Math.sin(clock.elapsedTime * 1.6) * 0.15);
  });
  return <mesh><sphereGeometry args={[radius, 64, 64]} /><shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={`varying vec3 vNormal; varying vec3 vViewPosition; void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.0);vViewPosition=-mvPosition.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mvPosition;}`} fragmentShader={`uniform vec3 color;uniform float power;uniform float intensity;varying vec3 vNormal;varying vec3 vViewPosition;void main(){vec3 normal=normalize(vNormal);vec3 viewDir=normalize(vViewPosition);float fresnel=pow(1.0-max(dot(viewDir,normal),0.0),power);gl_FragColor=vec4(color,fresnel*intensity);}`} transparent blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>;
}

const chassisMat = new THREE.MeshStandardMaterial({ color: "#c4c4c4", roughness: 0.45, metalness: 0.1 });
const visorMat = new THREE.MeshStandardMaterial({ color: "#101418", roughness: 0.9, metalness: 0.1 });
const screenMat = new THREE.MeshStandardMaterial({ color: "#05080a", emissive: new THREE.Color("#5ff0d8"), emissiveIntensity: 0.42, roughness: 0.35 });
const earBaseMat = new THREE.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.5 });
const earRingMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
const earCenterMat = new THREE.MeshStandardMaterial({ color: "#cccccc", roughness: 0.8 });
const antennaBaseMat = new THREE.MeshStandardMaterial({ color: "#999999", roughness: 0.4, metalness: 0.5 });
const antennaStickMat = new THREE.MeshStandardMaterial({ color: "#d0d0d0", roughness: 0.4, metalness: 0.2 });
const antennaTipMat = new THREE.MeshStandardMaterial({ color: "#5ff0d8", emissive: new THREE.Color("#5ff0d8"), emissiveIntensity: 2, toneMapped: false });
const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), toneMapped: false, transparent: true });
const heartMat = new THREE.MeshBasicMaterial({ color: "#ffb562", toneMapped: false });

function RobotEar({ position, scale = 1, isLeft = false }: { position: [number, number, number]; scale?: number; isLeft?: boolean }) {
  const dir = isLeft ? -1 : 1;
  return <group position={position} scale={scale}>
    <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={earBaseMat}><cylinderGeometry args={[0.04, 0.04, 0.025, 32]} /></mesh>
    <mesh position={[dir * 0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={earRingMat}><torusGeometry args={[0.032, 0.008, 16, 32]} /></mesh>
    <mesh position={[dir * 0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={earCenterMat}><cylinderGeometry args={[0.03, 0.03, 0.005, 32]} /></mesh>
    <group position={[dir * 0.015, 0.035, 0]} rotation={[-0.4, 0, 0]}><mesh position={[0, 0.01, 0]} material={antennaBaseMat}><cylinderGeometry args={[0.006, 0.008, 0.02, 16]} /></mesh><mesh position={[0, 0.06, 0]} material={antennaStickMat}><cylinderGeometry args={[0.003, 0.003, 0.1, 8]} /></mesh><mesh position={[0, 0.11, 0]} material={antennaTipMat}><sphereGeometry args={[0.006, 16, 16]} /></mesh></group>
  </group>;
}

function RobotEye({ position, rotation = [0, 0, 0], scale = 1, blinkCycle = 3, isLovedRef }: { position: [number, number, number]; rotation?: [number, number, number]; scale?: number; blinkCycle?: number; isLovedRef: React.MutableRefObject<boolean> }) {
  const groupRef = useRef<THREE.Group>(null); const normalRef = useRef<THREE.Group>(null); const heartRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (!groupRef.current || !normalRef.current || !heartRef.current) return; const loved = isLovedRef.current; normalRef.current.visible = !loved; heartRef.current.visible = loved; const cycle = clock.elapsedTime % blinkCycle; const blink = cycle < 0.15 && !loved ? Math.max(0.05, 1 - Math.sin((cycle / 0.15) * Math.PI)) : 1; groupRef.current.scale.set(scale, scale * blink, scale); });
  const paths = useMemo(() => { const w = 0.025, h = 0.035, r = 0.02, g = 0.005; const V = (x: number, y: number) => new THREE.Vector3(x, y, 0); const build = (sign: number) => { const p = new THREE.CurvePath<THREE.Vector3>(); p.add(new THREE.LineCurve3(V(-w, sign * g), V(-w, sign * (h - r)))); p.add(new THREE.QuadraticBezierCurve3(V(-w, sign * (h - r)), V(-w, sign * h), V(-w + r, sign * h))); p.add(new THREE.LineCurve3(V(-w + r, sign * h), V(w - r, sign * h))); p.add(new THREE.QuadraticBezierCurve3(V(w - r, sign * h), V(w, sign * h), V(w, sign * (h - r)))); p.add(new THREE.LineCurve3(V(w, sign * (h - r)), V(w, sign * g))); return p; }; return { top: build(1), bottom: build(-1) }; }, []);
  return <group ref={groupRef} position={position} rotation={rotation} scale={scale}><mesh ref={heartRef} visible={false} material={heartMat}><tubeGeometry args={[sharedHeartCurve, 64, 0.0035, 8, true]} /></mesh><group ref={normalRef}><mesh material={eyeMat}><tubeGeometry args={[paths.top, 20, 0.0035, 8, false]} /></mesh><mesh material={eyeMat}><tubeGeometry args={[paths.bottom, 20, 0.0035, 8, false]} /></mesh></group></group>;
}

export function Robot({ screenColor = "#5ff0d8", screenGlow = 1.2, blinkCycle = 3, shield = true, follow = true }: { screenColor?: string; screenGlow?: number; blinkCycle?: number; shield?: boolean; follow?: boolean }) {
  const lovedRef = useRef(false); const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); const bodyRef = useRef<THREE.Group>(null); const headRef = useRef<THREE.Group>(null);
  const config = { moveSpeed: 1.6, bodyRotSpeed: 6, headRotSpeed: 10, bodyTiltY: 0.5, headLookX: 0.3, headLookY: 0.9 };
  useFrame((state, raw) => { if (!bodyRef.current || !headRef.current) return; const dt = Math.min(raw, 0.05), t = state.clock.elapsedTime; const tx = follow ? state.pointer.x : Math.sin(t * 0.4) * 0.5, ty = follow ? state.pointer.y : Math.sin(t * 0.3) * 0.2, target = tx * Math.min(1.6, state.viewport.width / 5); bodyRef.current.position.x = THREE.MathUtils.damp(bodyRef.current.position.x, target, config.moveSpeed, dt); bodyRef.current.position.y = Math.sin(t * 0.9) * 0.06; const relative = tx - bodyRef.current.position.x / 2.5; bodyRef.current.rotation.y = THREE.MathUtils.damp(bodyRef.current.rotation.y, -relative * config.bodyTiltY, config.bodyRotSpeed, dt); bodyRef.current.rotation.x = THREE.MathUtils.damp(bodyRef.current.rotation.x, -ty * 0.2, config.bodyRotSpeed, dt); bodyRef.current.rotation.z = THREE.MathUtils.damp(bodyRef.current.rotation.z, -relative * 0.12, config.bodyRotSpeed, dt); headRef.current.rotation.y = THREE.MathUtils.damp(headRef.current.rotation.y, relative * config.headLookY, config.headRotSpeed, dt); headRef.current.rotation.x = THREE.MathUtils.damp(headRef.current.rotation.x, -ty * config.headLookX, config.headRotSpeed, dt); });
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); lovedRef.current = true; if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => { lovedRef.current = false; }, 2000); };
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  const screen = useMemo(() => { const mat = screenMat.clone(); mat.emissive.set(screenColor); mat.emissiveIntensity = screenGlow * 0.35; return mat; }, [screenColor, screenGlow]);
  return <group ref={bodyRef} onPointerDown={handlePointerDown} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "auto")}>
    <mesh position={[0, 0.42, 0]} castShadow receiveShadow material={chassisMat}><capsuleGeometry args={[0.36, 0.42, 12, 48]} /></mesh><mesh position={[0, 0.06, 0]} castShadow material={chassisMat}><cylinderGeometry args={[0.34, 0.3, 0.1, 48]} /></mesh><mesh position={[0, 0.45, 0.345]} material={screen}><boxGeometry args={[0.24, 0.14, 0.02]} /></mesh><mesh position={[0, 0.78, 0]} castShadow material={chassisMat}><cylinderGeometry args={[0.2, 0.24, 0.07, 48]} /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.42, 0.4, 0]} rotation={[0, 0, side * 0.2]} castShadow material={chassisMat}><capsuleGeometry args={[0.075, 0.32, 8, 24]} /></mesh>)}
    <group ref={headRef} position={[0, 1.02, 0]}><mesh castShadow receiveShadow material={chassisMat}><sphereGeometry args={[0.3, 48, 48]} /></mesh><mesh position={[0, 0, 0.01]} rotation={[Math.PI / 2 - 0.3, 0, 0]} scale={[1, 1, 0.85]} material={visorMat}><sphereGeometry args={[0.303, 48, 48, 0, Math.PI * 2, 0, Math.PI * 0.44]} /></mesh><RobotEye position={[-0.085, 0.055, 0.3]} rotation={[-0.25, 0, 0]} scale={2.2} blinkCycle={blinkCycle} isLovedRef={lovedRef} /><RobotEye position={[0.085, 0.055, 0.3]} rotation={[-0.25, 0, 0]} scale={2.2} blinkCycle={blinkCycle} isLovedRef={lovedRef} /><RobotEar position={[-0.29, 0, 0]} scale={1.3} isLeft /><RobotEar position={[0.29, 0, 0]} scale={1.3} />{shield && <GlassCapsule color={screenColor} radius={0.36} intensity={0.75} power={2.2} />}</group>
    {shield && <group position={[0, 0.5, 0]}><GlassCapsule color={screenColor} radius={0.78} intensity={0.5} power={2.6} /></group>}
  </group>;
}
export default Robot;
