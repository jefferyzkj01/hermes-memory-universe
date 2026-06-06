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
const SPACE_SCALE = 1.6
const GLOW_DECAY = 0.9
const GRAPH_BRIGHTNESS = 1.8
const STAR_DENSITY = 1.5

function endpointId(endpoint) {
  return typeof endpoint === 'object' ? endpoint.id : endpoint
}

function isSelectedLink(link, selectedId) {
  if (!selectedId) return false
  return endpointId(link.source) === selectedId || endpointId(link.target) === selectedId
}

function colorFor(node, nebulaTheme) {
  return nebulaTheme?.[node.keywordCore]?.color ?? nebulaTheme?.[node.nebula]?.color ?? '#9ca3af'
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function brightenOpacity(value, cap = 1) {
  return clamp(value * GRAPH_BRIGHTNESS, 0, cap)
}

function calculateInfoLight(node, degree = 0) {
  const textWeight = `${node.label ?? ''} ${node.summary ?? ''}`.length / 520
  const tagWeight = (node.tags?.length ?? 0) * 0.025
  const semanticWeight = (node.semanticKeywords?.length ?? 0) * 0.035
  const sizeWeight = Math.max(0, Number(node.size ?? 4) - 4) / 18
  const keywordWeight = Math.log1p(Math.max(0, Number(node.keywordScore ?? 0))) / 8
  const linkWeight = Math.log1p(degree) / 5
  return clamp(0.12 + textWeight + tagWeight + semanticWeight + sizeWeight + keywordWeight + linkWeight, 0.14, 1)
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

function makeGlowTexture({ color = '#ffffff' } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.055, 'rgba(255,255,255,0.96)')
  gradient.addColorStop(0.16, toRgba(color, 0.78))
  gradient.addColorStop(0.34, toRgba(color, 0.38))
  gradient.addColorStop(0.62, toRgba(color, 0.14))
  gradient.addColorStop(0.86, toRgba(color, 0.035))
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeCosmicBandTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 384
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  base.addColorStop(0, 'rgba(83,112,255,0)')
  base.addColorStop(0.22, 'rgba(94,151,255,.20)')
  base.addColorStop(0.5, 'rgba(186,142,255,.24)')
  base.addColorStop(0.76, 'rgba(81,206,255,.18)')
  base.addColorStop(1, 'rgba(83,112,255,0)')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 34; i += 1) {
    const x = seededUnit(i * 73 + 9) * canvas.width
    const y = 92 + seededUnit(i * 137 + 17) * 200
    const r = 86 + seededUnit(i * 191 + 31) * 220
    const hue = i % 3 === 0 ? '154,219,255' : i % 3 === 1 ? '185,160,255' : '255,235,204'
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${hue},${0.10 + seededUnit(i * 11) * 0.12})`)
    g.addColorStop(0.45, `rgba(${hue},.035)`)
    g.addColorStop(1, `rgba(${hue},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4
      const centerFade = 1 - Math.min(1, Math.abs(y - canvas.height / 2) / (canvas.height / 2))
      const filament = Math.max(0, Math.sin(x * 0.018 + Math.sin(y * 0.028) * 3.6) * Math.cos(y * 0.044 + x * 0.004))
      data[i + 3] = Math.min(210, data[i + 3] * (0.4 + centerFade * 0.86) + filament * 34 * centerFade)
    }
  }
  ctx.putImageData(image, 0, 0)

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
  const count = Math.round(2700 * STAR_DENSITY)
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
  const material = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      size: { value: 4.8 },
      opacity: { value: 0.88 },
    },
    vertexShader: `
      varying vec3 vColor;
      uniform float size;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (520.0 / max(80.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float opacity;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv);
        if (dist > 0.5) discard;
        float core = smoothstep(0.5, 0.0, dist);
        float halo = smoothstep(0.5, 0.18, dist) * 0.34;
        float alpha = min(1.0, core * core + halo) * opacity;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  })
  const stars = new THREE.Points(geometry, material)
  stars.name = 'deep-starfield'
  scene.add(stars)
  return stars
}


function addCosmicEnvironment(scene, texturesRef) {
  const created = []
  const bandTexture = texturesRef.current.cosmicBand
  const glowTexture = texturesRef.current.nodeGlow

  const bandMaterial = new THREE.SpriteMaterial({
    map: bandTexture,
    color: '#ffffff',
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const band = new THREE.Sprite(bandMaterial)
  band.name = 'cosmic-band'
  band.position.set(-40, 8, -560)
  band.scale.set(1320, 520, 1)
  band.material.rotation = -0.28
  band.userData.phase = 0.2
  scene.add(band)
  created.push(band)

  const aurora = new THREE.Sprite(new THREE.SpriteMaterial({
    map: bandTexture,
    color: '#8bdfff',
    transparent: true,
    opacity: 0.20,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  aurora.name = 'cosmic-aurora'
  aurora.position.set(250, -145, -480)
  aurora.scale.set(920, 310, 1)
  aurora.material.rotation = 0.42
  aurora.userData.phase = 1.8
  scene.add(aurora)
  created.push(aurora)

  const distantMoon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: '#d9e7ff',
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  distantMoon.name = 'distant-celestial-glow'
  distantMoon.position.set(-390, 210, -590)
  distantMoon.scale.set(92, 92, 1)
  distantMoon.userData.phase = 2.7
  scene.add(distantMoon)
  created.push(distantMoon)

  const horizon = new THREE.Mesh(
    new THREE.TorusGeometry(360, 0.38, 8, 192, Math.PI * 1.25),
    new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  horizon.name = 'deep-space-horizon-arc'
  horizon.position.set(0, -235, -315)
  horizon.rotation.set(Math.PI * 0.58, 0.16, -0.22)
  scene.add(horizon)
  created.push(horizon)

  return created
}

function createNodeObject(node, nebulaTheme, selectedIdRef, texturesRef) {
  const group = new THREE.Group()
  const baseColor = colorFor(node, nebulaTheme)
  const color = new THREE.Color(baseColor)
  const isSelected = selectedIdRef.current === node.id
  const isCore = node.type === 'core' || node.type === 'keyword_core'
  const infoLight = Math.max(0.18, Math.min(1, Number(node.infoLight ?? 0.42)))
  const radius = isCore ? 2.35 + infoLight * 2.4 : 0.72 + infoLight * 1.12
  const glowScale = isCore ? 8.8 + infoLight * 9.2 : 5.4 + infoLight * 8.8
  const coreOpacity = isSelected ? 1 : isCore ? 0.98 : 0.74 + infoLight * 0.26
  const haloOpacity = brightenOpacity((isSelected ? 1 : isCore ? 0.68 + infoLight * 0.25 : 0.28 + infoLight * 0.58) * GLOW_DECAY)

  const glowTexture = texturesRef.current.nodeGlow
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity: haloOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  halo.scale.set(radius * (isSelected ? glowScale * 1.14 : glowScale), radius * (isSelected ? glowScale * 1.14 : glowScale), 1)
  group.add(halo)

  const lightPoint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: isSelected ? '#ffffff' : color,
    transparent: true,
    opacity: brightenOpacity(coreOpacity),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  lightPoint.scale.set(radius * 2.7, radius * 2.7, 1)
  group.add(lightPoint)

  const pinLight = new THREE.PointLight(color, (isSelected ? 1.05 : isCore ? 0.48 + infoLight * 0.5 : 0.08 + infoLight * 0.18) * GLOW_DECAY * GRAPH_BRIGHTNESS, isCore ? 86 : 42)
  group.add(pinLight)

  if (isSelected || isCore) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.95, Math.max(0.018, radius * 0.018), 8, 96),
      new THREE.MeshBasicMaterial({ color: isSelected ? '#ffffff' : baseColor, transparent: true, opacity: brightenOpacity(0.42 * GLOW_DECAY), blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    ring.rotation.x = Math.PI / 2.7
    ring.rotation.y = Math.PI / 5
    group.add(ring)
  }

  const atmosphere = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity: brightenOpacity((isSelected ? 0.13 : isCore ? 0.075 + infoLight * 0.045 : 0.035 + infoLight * 0.035) * GLOW_DECAY, 0.16),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  atmosphere.position.set(0, 0, -radius * 0.22)
  const atmosphereScale = radius * (isCore ? 8.6 + infoLight * 4.2 : 5.8 + infoLight * 3.4)
  atmosphere.scale.set(atmosphereScale, atmosphereScale, 1)
  group.add(atmosphere)

  group.userData = { id: node.id }
  return group
}

function buildNebulaCoords(graph) {
  const coords = { ...NEBULA_COORDS }
  const cores = graph.keywordCores ?? []
  const count = Math.max(1, cores.length)
  cores.forEach((core, index) => {
    const angle = (index / count) * Math.PI * 2 + 0.32
    const layer = index % 2 === 0 ? 1 : -1
    const radius = (178 + (index % 3) * 24) * SPACE_SCALE
    coords[core.key] = [
      Math.cos(angle) * radius,
      (Math.sin(angle * 1.17) * 88 + layer * 26) * SPACE_SCALE,
      Math.sin(angle) * radius * 0.74,
    ]
  })
  Object.keys(coords).forEach((key) => {
    if (key.startsWith('kw-')) return
    coords[key] = coords[key].map((value) => value * SPACE_SCALE)
  })
  coords['kw-orbit'] = [0, 0, 0]
  return coords
}

function prepareGraphData(graph, nebulaCoords) {
  const degree = new Map()
  graph.links.forEach((link) => {
    const source = typeof link.source === 'object' ? link.source.id : link.source
    const target = typeof link.target === 'object' ? link.target.id : link.target
    degree.set(source, (degree.get(source) ?? 0) + 1)
    degree.set(target, (degree.get(target) ?? 0) + 1)
  })

  return {
    nodes: graph.nodes.map((node) => {
      const semanticKey = node.keywordCore ?? (node.type === 'core' ? 'kw-orbit' : node.nebula)
      const center = nebulaCoords[semanticKey] ?? nebulaCoords[node.nebula] ?? FALLBACK_COORDS
      const [ox, oy, oz] = deterministicOffset(node.id, node.type === 'keyword_core' ? 2 : 46 * SPACE_SCALE)
      const x = center[0] + (node.type === 'keyword_core' ? 0 : ox)
      const y = center[1] + (node.type === 'keyword_core' ? 0 : oy)
      const z = center[2] + (node.type === 'keyword_core' ? 0 : oz)
      return {
        ...node,
        x,
        y,
        z,
        fx: x,
        fy: y,
        fz: z,
        infoLight: calculateInfoLight(node, degree.get(node.id) ?? 0),
      }
    }),
    links: graph.links.map((link) => ({ ...link })),
  }
}

export default function UniverseGraph({ graph, selectedNode, activeNebula, autoOrbit, onSelect, nebulaTheme }) {
  const containerRef = useRef(null)
  const graphRef = useRef(null)
  const selectedIdRef = useRef(selectedNode?.id)
  const animationRef = useRef(null)
  const sceneObjectsRef = useRef([])
  const texturesRef = useRef({})

  const nebulaCoords = useMemo(() => (graph ? buildNebulaCoords(graph) : NEBULA_COORDS), [graph])
  const preparedGraph = useMemo(() => (graph ? prepareGraphData(graph, nebulaCoords) : null), [graph, nebulaCoords])

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id
  }, [selectedNode])

  useEffect(() => {
    if (!containerRef.current || graphRef.current) return undefined

    texturesRef.current.nodeGlow = makeGlowTexture({ color: '#ffffff' })
    texturesRef.current.cosmicBand = makeCosmicBandTexture()

    const fg = ForceGraph3D()(containerRef.current)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .warmupTicks(160)
      .cooldownTicks(80)
      .nodeRelSize(0)
      .nodeThreeObject((node) => createNodeObject(node, nebulaTheme, selectedIdRef, texturesRef))
      .nodeLabel((node) => `${node.label}<br/><span>${node.type} · ${node.keyword ? `keyword: ${node.keyword}` : node.nebula}</span>`)
      .linkWidth((link) => {
        if (!isSelectedLink(link, selectedIdRef.current)) return 0
        if (link.type === 'skill') return 0.12
        return Math.max(0.25, (link.strength ?? 0.35) * (link.type === 'semantic-gravity' ? 1.7 : link.type === 'bridge' ? 1.35 : 0.72))
      })
      .linkVisibility((link) => isSelectedLink(link, selectedIdRef.current))
      .linkOpacity((link) => {
        if (!isSelectedLink(link, selectedIdRef.current)) return 0
        return link.type === 'skill' ? 0.025 : link.type === 'semantic-gravity' ? 0.30 : link.type === 'bridge' ? 0.18 : 0.07
      })
      .linkDirectionalParticles((link) => (isSelectedLink(link, selectedIdRef.current) ? (link.type === 'semantic-gravity' ? 2 : link.type === 'bridge' ? 1 : 0) : 0))
      .linkDirectionalParticleWidth((link) => (link.type === 'bridge' ? 1.25 : 0.48))
      .linkDirectionalParticleSpeed(0.0045)
      .linkColor((link) => (link.type === 'bridge' ? 'rgba(226,232,240,0.42)' : 'rgba(148,163,184,0.14)'))
      .onNodeClick((node) => {
        onSelect(node)
        const distance = (node.type === 'core' ? 150 : 96) * SPACE_SCALE
        const denom = Math.max(1, Math.hypot(node.x, node.y, node.z))
        const distRatio = 1 + distance / denom
        fg.cameraPosition({ x: node.x * distRatio, y: node.y * distRatio + 18, z: node.z * distRatio }, node, 1200)
      })
      .enableNodeDrag(false)

    fg.d3Force('charge').strength(0)
    fg.d3Force('link').strength(0)
    fg.d3Force('center').strength(0)

    const scene = fg.scene()
    scene.fog = new THREE.FogExp2(0x02040a, 0.00145)
    scene.add(new THREE.AmbientLight(0x7897d7, 1.15 * GRAPH_BRIGHTNESS))
    const key = new THREE.PointLight(0xbfd7ff, 2.1 * GRAPH_BRIGHTNESS, 720)
    key.position.set(110, 145, 180)
    scene.add(key)
    const violet = new THREE.PointLight(0x8b5cf6, 1.15 * GRAPH_BRIGHTNESS, 620)
    violet.position.set(-180, -80, -120)
    scene.add(violet)

    const cosmicEnvironment = addCosmicEnvironment(scene, texturesRef)
    sceneObjectsRef.current.push(...cosmicEnvironment)

    const stars = addStarField(scene)
    sceneObjectsRef.current.push(stars)

    Object.entries(nebulaTheme ?? {}).forEach(([keyName, theme], index) => {
      const center = nebulaCoords[keyName]
      if (!center) return
      const texture = makeNebulaTexture(theme.color ?? '#94a3b8', index % 2 === 0 ? '#7dd3fc' : '#c4b5fd')
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: '#ffffff',
        transparent: true,
        opacity: brightenOpacity(keyName === 'core' ? 0.13 : 0.085, keyName === 'core' ? 0.34 : 0.24),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(center[0], center[1], center[2] - 30)
      const scale = keyName === 'core' ? 175 : 138
      sprite.scale.set(scale * 1.35, scale, 1)
      sprite.userData.phase = index * 0.71
      sprite.userData.baseOpacity = material.opacity
      scene.add(sprite)
      sceneObjectsRef.current.push(sprite)
    })

    fg.cameraPosition({ x: 0, y: 58, z: 690 }, { x: 0, y: 0, z: 0 }, 0)
    fg.controls().autoRotate = false
    fg.controls().autoRotateSpeed = 0.18
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
        } else if (object.name === 'cosmic-band' || object.name === 'cosmic-aurora') {
          object.material.rotation += object.name === 'cosmic-band' ? 0.000045 : -0.000035
          object.material.opacity = (object.name === 'cosmic-band' ? 0.52 : 0.20) * (0.9 + Math.sin(t * 2 + object.userData.phase) * 0.08)
        } else if (object.name === 'distant-celestial-glow') {
          object.material.opacity = 0.15 + Math.sin(t * 1.7 + object.userData.phase) * 0.025
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
  }, [nebulaTheme, nebulaCoords, onSelect])

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

  useEffect(() => {
    if (!graphRef.current) return
    const fg = graphRef.current
    const controls = fg.controls()
    controls.autoRotate = Boolean(autoOrbit)
    controls.autoRotateSpeed = 0.18
    if (autoOrbit) {
      fg.cameraPosition({ x: 0, y: 70, z: 730 }, { x: 0, y: 0, z: 0 }, 1800)
    }
  }, [autoOrbit, activeNebula])

  return <div className="graph-canvas" data-auto-orbit={autoOrbit ? 'true' : 'false'} ref={containerRef} />
}
