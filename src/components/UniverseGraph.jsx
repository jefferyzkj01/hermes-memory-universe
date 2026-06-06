import { useEffect, useMemo, useRef } from 'react'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'

const NEBULA_COORDS = {
  core: [0, 0, 0],
  memory: [-155, 58, -30],
  skills: [150, 82, 14],
  tools: [118, -95, -42],
  investment: [-126, -88, 42],
  aesthetic: [8, 145, -72],
  sessions: [-12, -154, -10],
  automations: [190, -5, 82],
  knowledge: [-196, -4, 82],
}

const FALLBACK_COORDS = [84, 46, -22]

function colorFor(node, nebulaTheme) {
  return nebulaTheme?.[node.nebula]?.color ?? '#9ca3af'
}

function hashString(value = '') {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed) {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return ((value >>> 0) % 10000) / 10000
}

function deterministicOffset(id, radius = 38) {
  const base = hashString(id)
  const a = seededUnit(base) * Math.PI * 2
  const b = (seededUnit(base + 911) - 0.5) * Math.PI
  const r = radius * (0.32 + seededUnit(base + 1777) * 0.86)
  return [
    Math.cos(a) * Math.cos(b) * r,
    Math.sin(b) * r * 0.72,
    Math.sin(a) * Math.cos(b) * r,
  ]
}

function toRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const expanded = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean
  const number = Number.parseInt(expanded, 16)
  const r = (number >> 16) & 255
  const g = (number >> 8) & 255
  const b = number & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function makeGlowTexture({ color = '#ffffff', core = 0.18, softness = 0.78 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(96, 96, 0, 96, 96, 96)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(core, toRgba(color, 0.84))
  gradient.addColorStop(softness, toRgba(color, 0.22))
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 192, 192)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeNebulaTexture(colorA, colorB) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, 512, 512)

  const blobs = [
    [256, 256, 235, colorA, 0.35],
    [180, 224, 172, colorB, 0.24],
    [330, 288, 190, colorA, 0.18],
    [254, 168, 145, '#e2e8f0', 0.10],
  ]

  blobs.forEach(([x, y, r, color, opacity]) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`)
    g.addColorStop(0.42, `${color}${Math.floor(opacity * 0.45 * 255).toString(16).padStart(2, '0')}`)
    g.addColorStop(1, `${color}00`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 512, 512)
  })

  const image = ctx.getImageData(0, 0, 512, 512)
  const data = image.data
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const i = (y * 512 + x) * 4
      const n = Math.sin(x * 0.037 + Math.sin(y * 0.021) * 3.2) * Math.cos(y * 0.031)
      const filament = Math.max(0, n) * 38
      data[i + 3] = Math.max(0, Math.min(255, data[i + 3] + filament - 12))
    }
  }
  ctx.putImageData(image, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function addStarField(scene) {
  const count = 2700
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const color = new THREE.Color()

  for (let i = 0; i < count; i += 1) {
    const r = 420 + seededUnit(i * 19 + 7) * 720
    const theta = seededUnit(i * 31 + 11) * Math.PI * 2
    const phi = Math.acos(2 * seededUnit(i * 53 + 17) - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    color.setHSL(0.58 + seededUnit(i * 71) * 0.12, 0.18, 0.58 + seededUnit(i * 97) * 0.36)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.PointsMaterial({
    size: 1.25,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const stars = new THREE.Points(geometry, material)
  stars.name = 'deep-starfield'
  scene.add(stars)
  return stars
}

function createNodeObject(node, nebulaTheme, selectedIdRef, texturesRef) {
  const group = new THREE.Group()
  const baseColor = colorFor(node, nebulaTheme)
  const color = new THREE.Color(baseColor)
  const isSelected = selectedIdRef.current === node.id
  const isCore = node.type === 'core'
  const weight = Math.max(1, Number(node.size ?? 5))
  const radius = Math.max(2.6, weight * (isCore ? 1.28 : 0.82))

  const glowTexture = texturesRef.current.nodeGlow
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity: isSelected ? 0.92 : isCore ? 0.56 : 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  halo.scale.set(radius * (isSelected ? 9.4 : isCore ? 8.2 : 5.2), radius * (isSelected ? 9.4 : isCore ? 8.2 : 5.2), 1)
  group.add(halo)

  const geometry = new THREE.SphereGeometry(radius, 32, 32)
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: isSelected ? 2.15 : isCore ? 1.38 : 0.72,
    roughness: 0.34,
    metalness: 0.0,
    clearcoat: 0.4,
    transparent: true,
    opacity: isSelected ? 1 : 0.94,
  })
  group.add(new THREE.Mesh(geometry, material))

  if (isSelected || isCore) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 2.05, Math.max(0.04, radius * 0.035), 8, 96),
      new THREE.MeshBasicMaterial({ color: isSelected ? '#ffffff' : baseColor, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    ring.rotation.x = Math.PI / 2.7
    ring.rotation.y = Math.PI / 5
    group.add(ring)
  }

  const dustCount = isCore ? 18 : isSelected ? 14 : 6
  for (let i = 0; i < dustCount; i += 1) {
    const angle = (i / dustCount) * Math.PI * 2
    const orbit = radius * (2.4 + seededUnit(hashString(node.id) + i * 13) * 2.6)
    const dust = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity: isSelected ? 0.44 : 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    dust.position.set(Math.cos(angle) * orbit, Math.sin(angle * 1.7) * orbit * 0.25, Math.sin(angle) * orbit)
    const size = radius * (0.55 + seededUnit(i + hashString(node.id)) * 0.8)
    dust.scale.set(size, size, 1)
    group.add(dust)
  }

  group.userData = { id: node.id }
  return group
}

function prepareGraphData(graph) {
  return {
    nodes: graph.nodes.map((node) => {
      const nebulaKey = node.type === 'core' ? 'core' : node.nebula
      const center = NEBULA_COORDS[nebulaKey] ?? FALLBACK_COORDS
      const [ox, oy, oz] = deterministicOffset(node.id, node.type === 'core' ? 4 : 54)
      const x = center[0] + ox
      const y = center[1] + oy
      const z = center[2] + oz
      return {
        ...node,
        x,
        y,
        z,
        // 2.0: keep domains as visible nebulae instead of letting the force solver
        // collapse everything into a generic ball around the highest-degree core node.
        fx: x,
        fy: y,
        fz: z,
      }
    }),
    links: graph.links.map((link) => ({ ...link })),
  }
}

export default function UniverseGraph({ graph, selectedNode, activeNebula, onSelect, nebulaTheme }) {
  const containerRef = useRef(null)
  const graphRef = useRef(null)
  const selectedIdRef = useRef(selectedNode?.id)
  const animationRef = useRef(null)
  const sceneObjectsRef = useRef([])
  const texturesRef = useRef({})

  const preparedGraph = useMemo(() => (graph ? prepareGraphData(graph) : null), [graph])

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id
  }, [selectedNode])

  useEffect(() => {
    if (!containerRef.current || graphRef.current) return undefined

    texturesRef.current.nodeGlow = makeGlowTexture({ color: '#ffffff' })

    const fg = ForceGraph3D()(containerRef.current)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .warmupTicks(160)
      .cooldownTicks(80)
      .nodeRelSize(0)
      .nodeThreeObject((node) => createNodeObject(node, nebulaTheme, selectedIdRef, texturesRef))
      .nodeLabel((node) => `${node.label}<br/><span>${node.type} · ${node.nebula}</span>`)
      .linkWidth((link) => Math.max(0.25, (link.strength ?? 0.35) * (link.type === 'bridge' ? 1.65 : 0.85)))
      .linkOpacity((link) => (link.type === 'bridge' ? 0.24 : 0.11))
      .linkDirectionalParticles((link) => (link.type === 'bridge' ? 3 : 1))
      .linkDirectionalParticleWidth((link) => (link.type === 'bridge' ? 1.25 : 0.48))
      .linkDirectionalParticleSpeed(0.0045)
      .linkColor((link) => (link.type === 'bridge' ? 'rgba(226,232,240,0.42)' : 'rgba(148,163,184,0.14)'))
      .onNodeClick((node) => {
        onSelect(node)
        const distance = node.type === 'core' ? 150 : 96
        const denom = Math.max(1, Math.hypot(node.x, node.y, node.z))
        const distRatio = 1 + distance / denom
        fg.cameraPosition({ x: node.x * distRatio, y: node.y * distRatio + 18, z: node.z * distRatio }, node, 1200)
      })
      .enableNodeDrag(true)

    fg.d3Force('charge').strength(-34)
    fg.d3Force('link').distance((link) => (link.type === 'bridge' ? 150 : 62))
    fg.d3Force('center').strength(0.014)

    const scene = fg.scene()
    scene.fog = new THREE.FogExp2(0x02040a, 0.00145)
    scene.add(new THREE.AmbientLight(0x7897d7, 1.15))
    const key = new THREE.PointLight(0xbfd7ff, 2.1, 620)
    key.position.set(110, 145, 180)
    scene.add(key)
    const violet = new THREE.PointLight(0x8b5cf6, 1.15, 520)
    violet.position.set(-180, -80, -120)
    scene.add(violet)

    const stars = addStarField(scene)
    sceneObjectsRef.current.push(stars)

    Object.entries(nebulaTheme ?? {}).forEach(([keyName, theme], index) => {
      const center = NEBULA_COORDS[keyName]
      if (!center) return
      const texture = makeNebulaTexture(theme.color ?? '#94a3b8', index % 2 === 0 ? '#7dd3fc' : '#c4b5fd')
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: '#ffffff',
        transparent: true,
        opacity: keyName === 'core' ? 0.34 : 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(center[0], center[1], center[2] - 30)
      const scale = keyName === 'core' ? 310 : 230
      sprite.scale.set(scale * 1.35, scale, 1)
      sprite.userData.phase = index * 0.71
      sprite.userData.baseOpacity = material.opacity
      scene.add(sprite)
      sceneObjectsRef.current.push(sprite)
    })

    fg.cameraPosition({ x: 0, y: 36, z: 430 }, { x: 0, y: 0, z: 0 }, 0)
    fg.controls().autoRotate = true
    fg.controls().autoRotateSpeed = 0.28
    fg.controls().enableDamping = true
    fg.controls().dampingFactor = 0.055

    graphRef.current = fg

    const resize = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      fg.width(rect.width)
      fg.height(rect.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = (time) => {
      const t = time * 0.0001
      sceneObjectsRef.current.forEach((object) => {
        if (object.name === 'deep-starfield') {
          object.rotation.y = t * 0.16
          object.rotation.x = Math.sin(t * 0.31) * 0.035
        } else if (object.isSprite) {
          object.material.rotation = t * 0.32 + object.userData.phase
          object.material.opacity = object.userData.baseOpacity * (0.84 + Math.sin(t * 3 + object.userData.phase) * 0.12)
        }
      })
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      sceneObjectsRef.current.forEach((object) => {
        scene.remove(object)
        object.geometry?.dispose?.()
        object.material?.map?.dispose?.()
        object.material?.dispose?.()
      })
      sceneObjectsRef.current = []
      fg._destructor?.()
      graphRef.current = null
    }
  }, [nebulaTheme, onSelect])

  useEffect(() => {
    if (!graphRef.current || !preparedGraph) return
    graphRef.current.graphData(preparedGraph)
  }, [preparedGraph, activeNebula])

  useEffect(() => {
    if (!graphRef.current) return
    selectedIdRef.current = selectedNode?.id
    graphRef.current.nodeThreeObject((node) => createNodeObject(node, nebulaTheme, selectedIdRef, texturesRef))
    graphRef.current.refresh()
  }, [selectedNode, nebulaTheme])

  return <div className="graph-canvas" ref={containerRef} />
}
