import { useEffect, useRef } from 'react'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'

function colorFor(node, nebulaTheme) {
  return nebulaTheme?.[node.nebula]?.color ?? '#94a3b8'
}

export default function UniverseGraph({ graph, selectedNode, activeNebula, onSelect, nebulaTheme }) {
  const containerRef = useRef(null)
  const graphRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || graphRef.current) return
    const fg = ForceGraph3D()(containerRef.current)
      .backgroundColor('rgba(0,0,0,0)')
      .showNavInfo(false)
      .nodeThreeObject((node) => {
        const group = new THREE.Group()
        const color = new THREE.Color(colorFor(node, nebulaTheme))
        const geometry = new THREE.SphereGeometry(Math.max(3.2, node.size ?? 5), 24, 24)
        const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: node.type === 'core' ? 0.85 : 0.36, roughness: 0.52, metalness: 0.08 })
        group.add(new THREE.Mesh(geometry, material))
        const haloGeometry = new THREE.SphereGeometry(Math.max(5, (node.size ?? 5) * 1.72), 24, 24)
        const haloMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: node.type === 'core' ? 0.13 : 0.055, blending: THREE.AdditiveBlending, depthWrite: false })
        group.add(new THREE.Mesh(haloGeometry, haloMaterial))
        return group
      })
      .nodeLabel((node) => `${node.label}<br/><span>${node.type} · ${node.nebula}</span>`)
      .linkWidth((link) => Math.max(0.35, (link.strength ?? 0.35) * 1.8))
      .linkOpacity(0.34)
      .linkDirectionalParticles((link) => link.type === 'bridge' ? 2 : 0)
      .linkDirectionalParticleWidth(1.4)
      .linkColor((link) => link.type === 'bridge' ? 'rgba(226,232,240,0.62)' : 'rgba(148,163,184,0.28)')
      .onNodeClick((node) => {
        onSelect(node)
        const distance = 120
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z)
        fg.cameraPosition({ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, node, 900)
      })
      .enableNodeDrag(true)

    fg.d3Force('charge').strength(-110)
    fg.d3Force('link').distance((link) => link.type === 'bridge' ? 115 : 48)
    fg.scene().add(new THREE.AmbientLight(0xb7c7ff, 1.85))
    const light = new THREE.PointLight(0xffffff, 1.2)
    light.position.set(160, 120, 140)
    fg.scene().add(light)
    graphRef.current = fg

    const resize = () => {
      const rect = containerRef.current.getBoundingClientRect()
      fg.width(rect.width)
      fg.height(rect.height)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      fg._destructor?.()
      graphRef.current = null
    }
  }, [nebulaTheme, onSelect])

  useEffect(() => {
    if (!graphRef.current || !graph) return
    graphRef.current.graphData({ nodes: graph.nodes.map((node) => ({ ...node })), links: graph.links.map((link) => ({ ...link })) })
  }, [graph, activeNebula])

  useEffect(() => {
    if (!graphRef.current || !selectedNode) return
    graphRef.current.nodeColor((node) => node.id === selectedNode.id ? '#ffffff' : colorFor(node, nebulaTheme))
  }, [selectedNode, nebulaTheme])

  return <div className="graph-canvas" ref={containerRef} />
}
