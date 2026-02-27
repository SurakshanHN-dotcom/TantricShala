import React, { useRef, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { useYuktiStore } from '../store/useYuktiStore';
import { GraphNode, GraphEdge } from '../types';

interface GalaxyViewportProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// Color palette by extension
const EXT_COLORS: Record<string, string> = {
    'py': '#FFD43B', // Python Yellow
    'cpp': '#00599C', // C++ Blue
    'h': '#00599C',
    'js': '#F7DF1E', // JS Yellow
    'ts': '#3178C6', // TS Blue
    'tsx': '#3178C6',
    'json': '#7FFF00', // Neon Green
    'md': '#E0E0E0',
    'default': '#00F0FF' // Neon Cyan default
};

export default function GalaxyViewport({ nodes, edges }: GalaxyViewportProps) {
    const { paneState, setMaximizedPane, setActiveNode, activeNode, riskNodes } = useYuktiStore();
    const fgRef = useRef<any>();

    const isMaximized = paneState.maximizedPane === 'center';

    // Prep data for ForceGraph3D
    const gData = useMemo(() => {
        return {
            nodes: nodes.map(n => ({
                ...n,
                // Assign color by extension
                color: EXT_COLORS[n.file_path.split('.').pop()?.toLowerCase() || 'default'] || '#00F0FF',
                // Size by LOC if available, else default
                val: n.loc ? Math.log(n.loc) * 2 : 2
            })),
            links: edges.map(e => ({
                source: e.source_id,
                target: e.target_id,
                ...e
            }))
        };
    }, [nodes, edges]);

    const handleNodeClick = useCallback((node: any) => {
        setActiveNode(node as GraphNode);

        // Fly to node
        if (fgRef.current) {
            // Aim at node from outside it
            const distance = 40;
            const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

            fgRef.current.cameraPosition(
                { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
                node, // lookAt
                1500  // ms transition
            );
        }
    }, [setActiveNode]);

    const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
        // Mock Context Menu Logic
        console.log("Right clicked", node);
        setActiveNode(node as GraphNode);
        // Here we'd normally open a context menu
        alert(`Sentinel Audit Requested for: ${node.name}`);
    }, [setActiveNode]);

    // Custom Node Object for Risk Vibration
    const createNodeObject = useCallback((node: any) => {
        const isRisk = riskNodes.has(node.id);
        const isActive = activeNode?.id === node.id;

        let color = isActive ? '#FFFFFF' : node.color;

        const material = new THREE.MeshPhongMaterial({
            color,
            transparent: true,
            opacity: isActive ? 1 : 0.8
        });

        // Base geometry
        const geometry = new THREE.SphereGeometry(node.val);
        const mesh = new THREE.Mesh(geometry, material);

        if (isRisk) {
            // Add pulsing red aura
            const auraGeom = new THREE.SphereGeometry(node.val * 1.5);
            const auraMat = new THREE.MeshBasicMaterial({
                color: '#FF3333',
                transparent: true,
                opacity: 0.3
            });
            const aura = new THREE.Mesh(auraGeom, auraMat);
            // We can't easily animate in the render loop here without direct Three.js loop access, 
            // but we add the visual wrapper
            mesh.add(aura);
        }

        return mesh;
    }, [activeNode, riskNodes]);

    return (
        <div className="absolute inset-0 flex flex-col bg-void">
            {/* Header */}
            <div className="pane-header absolute top-0 left-0 w-full z-10 bg-transparent border-b border-white/5">
                <div className="pane-title text-[11px] font-mono font-semibold tracking-widest text-[#00F0FF] uppercase drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                    Galaxy
                </div>
                <div className="flex gap-2">
                    <button
                        className="maximize-btn text-white/40 hover:text-[#00F0FF] transition-colors"
                        onClick={() => setMaximizedPane(isMaximized ? null : 'center')}
                    >
                        {isMaximized ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
                        )}
                    </button>
                </div>
            </div>

            {/* 3D Force Graph */}
            <div className="flex-1 w-full h-full relative" style={{ background: 'radial-gradient(circle at center, #0C0D1A 0%, #05050A 100%)' }}>
                {nodes.length === 0 ? (
                    <div className="galaxy-empty-state">
                        <div className="nebula-wireframe">
                            <div className="drop-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                    <polyline points="2 17 12 22 22 17"></polyline>
                                    <polyline points="2 12 12 17 22 12"></polyline>
                                </svg>
                            </div>
                        </div>
                        <div className="drop-text">DROP CODEBASE HERE</div>
                    </div>
                ) : (
                    <ForceGraph3D
                        ref={fgRef}
                        graphData={gData}
                        nodeThreeObject={createNodeObject}
                        nodeLabel="name"
                        onNodeClick={handleNodeClick}
                        onNodeRightClick={handleNodeRightClick}
                        linkWidth={0.5}
                        linkColor={() => 'rgba(255,255,255,0.15)'}
                        linkDirectionalParticles={1} // Data flow pulses
                        linkDirectionalParticleSpeed={0.005} // Slow movement
                        linkDirectionalParticleWidth={2}
                        backgroundColor="#000000"
                        showNavInfo={false}
                    />
                )}
            </div>
        </div>
    );
}
