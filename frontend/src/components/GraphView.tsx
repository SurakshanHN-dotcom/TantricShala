/**
 * GraphView.tsx – Interactive Architectural Visualization.
 * 
 * Powered by D3.js, this component renders a force-directed graph of the codebase.
 * Key Features:
 * - Dynamic Simulation: Nodes (Modules, Classes, Functions) and Edges (Calls, Imports) 
 *   cluster naturally based on their architectural relationships.
 * - Zoom & Pan: Allows intuitive navigation of large-scale code graphs.
 * - Blast-Radius Heatmap: Highlights affected nodes with electric-blue or red rings.
 * - Tooltips & Interactive Selection: Provides contextual node details on hover/click.
 */
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { GraphNode, GraphEdge, D3Node, D3Edge } from '../types';

/** Color palette for architectural symbols */
const NODE_COLORS: Record<string, string> = {
    Module: '#818cf8', Class: '#34d399', Function: '#60a5fa',
    Variable: '#a78bfa', UnresolvedSymbol: '#6b7280',
};

const NODE_RADII: Record<string, number> = {
    Module: 14, Class: 11, Function: 8, Variable: 6, UnresolvedSymbol: 5,
};

interface GraphViewProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    blastNodeIds: Set<string>;
    changedNodeIds: Set<string>;
    onNodeSelect: (node: GraphNode | null) => void;
}

export default function GraphView({
    nodes, edges, blastNodeIds, changedNodeIds, onNodeSelect,
}: GraphViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const simRef = useRef<d3.Simulation<D3Node, D3Edge> | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // Track container dimensions
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const measure = () => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setDimensions({ width: rect.width, height: rect.height });
            }
        };

        // Measure after initial layout
        const timer = setTimeout(measure, 50);
        const ro = new ResizeObserver(measure);
        ro.observe(el);

        return () => {
            clearTimeout(timer);
            ro.disconnect();
        };
    }, []);

    // Build the D3 graph when dimensions are available
    useEffect(() => {
        const { width, height } = dimensions;
        if (width === 0 || height === 0 || !svgRef.current || !nodes.length) return;

        // Stop any previous simulation
        simRef.current?.stop();

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        // ── Zoom container ─────────────────────────────────────
        const g = svg.append('g');
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.15, 4])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svg.call(zoom);

        // ── Arrow markers ──────────────────────────────────────
        const defs = svg.append('defs');
        const markerColors: Record<string, string> = {
            CALLS: '#ef4444', IMPORTS: '#6366f1', INHERITS: '#34d399', DEFINES: '#94a3b8',
        };
        Object.entries(markerColors).forEach(([t, color]) => {
            defs.append('marker')
                .attr('id', `arrow-${t}`)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 18).attr('refY', 0)
                .attr('markerWidth', 6).attr('markerHeight', 6)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-5L10,0L0,5')
                .attr('fill', color)
                .attr('opacity', 0.7);
        });

        // ── Data preparation ───────────────────────────────────
        const nodeById = new Map<string, D3Node>();
        const d3Nodes: D3Node[] = nodes.map((n) => {
            const d: D3Node = { ...n };
            nodeById.set(n.id, d);
            return d;
        });

        const d3Edges: D3Edge[] = edges
            .filter((e) => nodeById.has(e.source_id) && nodeById.has(e.target_id))
            .map((e) => ({
                source: nodeById.get(e.source_id)!,
                target: nodeById.get(e.target_id)!,
                relationship: e.relationship,
                file_path: e.file_path,
                line: e.line,
            }));

        // ── Simulation ─────────────────────────────────────────
        const sim = d3.forceSimulation<D3Node>(d3Nodes)
            .force('link', d3.forceLink<D3Node, D3Edge>(d3Edges)
                .id((d) => d.id)
                .distance((d) => {
                    if (d.relationship === 'DEFINES') return 60;
                    if (d.relationship === 'CALLS') return 90;
                    return 110;
                })
                .strength(0.4))
            .force('charge', d3.forceManyBody().strength(-280))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide<D3Node>().radius((d) => (NODE_RADII[d.label] ?? 8) + 12));
        simRef.current = sim;

        // ── Links ──────────────────────────────────────────────
        const link = g.append('g').attr('class', 'links')
            .selectAll<SVGLineElement, D3Edge>('line')
            .data(d3Edges)
            .join('line')
            .attr('class', (d) => {
                const srcId = (d.source as D3Node).id;
                const tgtId = (d.target as D3Node).id;
                const isBr = blastNodeIds.has(srcId) || blastNodeIds.has(tgtId) || changedNodeIds.has(srcId);
                return `graph-link ${d.relationship}${isBr ? ' blast-edge' : ''}`;
            })
            .attr('marker-end', (d) => `url(#arrow-${d.relationship})`);

        // ── Nodes ──────────────────────────────────────────────
        const nodeG = g.append('g').attr('class', 'nodes')
            .selectAll<SVGGElement, D3Node>('g')
            .data(d3Nodes)
            .join('g')
            .attr('class', 'node-group')
            .call(
                d3.drag<SVGGElement, D3Node>()
                    .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
                    .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
            );

        nodeG.append('circle')
            .attr('class', (d) => {
                if (changedNodeIds.has(d.id)) return 'node-circle blast-changed';
                if (blastNodeIds.has(d.id)) return 'node-circle blast-affected';
                return 'node-circle';
            })
            .attr('r', (d) => NODE_RADII[d.label] ?? 8)
            .attr('fill', (d) => {
                if (changedNodeIds.has(d.id)) return '#7f1d1d';
                if (blastNodeIds.has(d.id)) return '#450a0a';
                return `${NODE_COLORS[d.label] ?? '#6b7280'}22`;
            })
            .attr('stroke', (d) => {
                if (changedNodeIds.has(d.id)) return '#ef4444';
                if (blastNodeIds.has(d.id)) return '#f87171';
                return NODE_COLORS[d.label] ?? '#6b7280';
            });

        nodeG.append('text')
            .attr('class', (d) => `node-label${blastNodeIds.has(d.id) || changedNodeIds.has(d.id) ? ' blast-label' : ''}`)
            .attr('dx', (d) => (NODE_RADII[d.label] ?? 8) + 4)
            .attr('dy', '0.35em')
            .text((d) => d.name.length > 18 ? d.name.slice(0, 16) + '…' : d.name);

        // ── Interactions ───────────────────────────────────────
        const tooltip = d3.select(tooltipRef.current!);
        nodeG
            .on('mouseover', (_event, d) => {
                tooltip.style('display', 'block')
                    .html(`<strong>${d.name}</strong><span>${d.label} · ${d.file_path}:${d.line_start}</span>`);
            })
            .on('mousemove', (event) => {
                const rect = svgRef.current!.getBoundingClientRect();
                tooltip
                    .style('left', `${event.clientX - rect.left + 12}px`)
                    .style('top', `${event.clientY - rect.top - 20}px`);
            })
            .on('mouseout', () => tooltip.style('display', 'none'))
            .on('click', (_, d) => onNodeSelect(d));

        // ── Tick ───────────────────────────────────────────────
        sim.on('tick', () => {
            link
                .attr('x1', (d) => (d.source as D3Node).x ?? 0)
                .attr('y1', (d) => (d.source as D3Node).y ?? 0)
                .attr('x2', (d) => (d.target as D3Node).x ?? 0)
                .attr('y2', (d) => (d.target as D3Node).y ?? 0);
            nodeG.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
        });

        // Auto-zoom to fit after stabilization
        setTimeout(() => {
            const gNode = g.node();
            if (!gNode) return;
            const bounds = gNode.getBBox();
            if (bounds.width === 0 || bounds.height === 0) return;
            const scale = Math.min(0.85 * width / bounds.width, 0.85 * height / bounds.height, 1.5);
            const tx = (width - scale * (bounds.x * 2 + bounds.width)) / 2;
            const ty = (height - scale * (bounds.y * 2 + bounds.height)) / 2;
            svg.transition().duration(600).call(
                zoom.transform,
                d3.zoomIdentity.translate(tx, ty).scale(scale)
            );
        }, 1500);

        return () => { sim.stop(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dimensions, nodes, edges]);

    return (
        <div className="graph-canvas" ref={containerRef}>
            <svg ref={svgRef} />
            <div className="graph-tooltip" ref={tooltipRef} style={{ display: 'none' }} />
            <div className="graph-legend">
                {Object.entries(NODE_COLORS).filter(([k]) => k !== 'UnresolvedSymbol').map(([label, color]) => (
                    <div key={label} className="legend-item">
                        <div className="legend-dot" style={{ background: color }} />
                        <span>{label}</span>
                    </div>
                ))}
                <div className="legend-item" style={{ marginTop: 4 }}>
                    <div className="legend-dot" style={{ background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.6)' }} />
                    <span>Blast Radius</span>
                </div>
            </div>
        </div>
    );
}
