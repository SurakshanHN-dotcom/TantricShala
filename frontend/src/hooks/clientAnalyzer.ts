// clientAnalyzer.ts — Local architecture risk analyzer
// Runs entirely in the browser. Analyzes the parsed graph to produce
// a personalized risk report without needing AWS/Bedrock.

import type { GraphNode, GraphEdge, AuditResult, RiskLevel } from '../types';

interface NodeRisk {
    node: GraphNode;
    inDegree: number;       // How many things call/depend on this
    outDegree: number;      // How many things this depends on
    blastRadius: number;    // Transitive downstream count
    couplingScore: number;  // Combined risk metric
}

interface ArchitectureReport {
    audit: AuditResult;
    blastRadius: {
        changed_nodes: number;
        affected_nodes: number;
        total_edges: number;
        max_hop_distance: number;
        symbols_queried: string[];
    };
    hubNodes: NodeRisk[];         // Highest-risk nodes
    orphanNodes: GraphNode[];     // Disconnected nodes
    fileComplexity: { file: string; nodes: number; edges: number }[];
}

/**
 * Build adjacency lists from edges.
 */
function buildAdjacency(nodes: GraphNode[], edges: GraphEdge[]) {
    const incoming = new Map<string, Set<string>>();  // target → sources
    const outgoing = new Map<string, Set<string>>();  // source → targets
    const edgeTypes = new Map<string, string[]>();     // nodeId → relationship types

    for (const n of nodes) {
        incoming.set(n.id, new Set());
        outgoing.set(n.id, new Set());
        edgeTypes.set(n.id, []);
    }

    for (const e of edges) {
        if (e.relationship === 'DEFINES') continue; // Skip structural edges
        incoming.get(e.target_id)?.add(e.source_id);
        outgoing.get(e.source_id)?.add(e.target_id);
        edgeTypes.get(e.source_id)?.push(e.relationship);
    }

    return { incoming, outgoing, edgeTypes };
}

/**
 * Compute transitive blast radius via BFS from a node.
 */
function computeBlastRadius(nodeId: string, incoming: Map<string, Set<string>>): Set<string> {
    const visited = new Set<string>();
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
        const current = queue.shift()!;
        // Find everything that CALLS/IMPORTS this node (reverse direction = "what breaks if I change this")
        const callers = incoming.get(current);
        if (callers) {
            for (const caller of callers) {
                if (!visited.has(caller)) {
                    visited.add(caller);
                    queue.push(caller);
                }
            }
        }
    }

    visited.delete(nodeId); // Don't count self
    return visited;
}

/**
 * Analyze the full codebase graph and produce a risk report.
 */
export function analyzeArchitecture(
    nodes: GraphNode[],
    edges: GraphEdge[],
    changedSymbols?: string[],
): ArchitectureReport {
    const { incoming, outgoing } = buildAdjacency(nodes, edges);
    const functionalEdges = edges.filter(e => e.relationship !== 'DEFINES');

    // ── Per-node risk scoring ───────────────────────────────
    const nodeRisks: NodeRisk[] = nodes
        .filter(n => n.label !== 'Module') // Skip module-level nodes
        .map(n => {
            const inDeg = incoming.get(n.id)?.size ?? 0;
            const outDeg = outgoing.get(n.id)?.size ?? 0;
            const blast = computeBlastRadius(n.id, incoming);
            return {
                node: n,
                inDegree: inDeg,
                outDegree: outDeg,
                blastRadius: blast.size,
                couplingScore: inDeg * 2 + outDeg + blast.size,
            };
        })
        .sort((a, b) => b.couplingScore - a.couplingScore);

    // ── Hub nodes (top 5 highest risk) ──────────────────────
    const hubNodes = nodeRisks.slice(0, 5);

    // ── Orphan nodes (no connections) ───────────────────────
    const orphanNodes = nodes.filter(n => {
        if (n.label === 'Module') return false;
        const inDeg = incoming.get(n.id)?.size ?? 0;
        const outDeg = outgoing.get(n.id)?.size ?? 0;
        return inDeg === 0 && outDeg === 0;
    });

    // ── Per-file complexity ─────────────────────────────────
    const fileMap = new Map<string, { nodes: number; edges: number }>();
    for (const n of nodes) {
        const f = fileMap.get(n.file_path) ?? { nodes: 0, edges: 0 };
        f.nodes++;
        fileMap.set(n.file_path, f);
    }
    for (const e of functionalEdges) {
        const f = fileMap.get(e.file_path) ?? { nodes: 0, edges: 0 };
        f.edges++;
        fileMap.set(e.file_path, f);
    }
    const fileComplexity = [...fileMap.entries()]
        .map(([file, stats]) => ({ file, ...stats }))
        .sort((a, b) => (b.nodes + b.edges) - (a.nodes + a.edges));

    // ── Blast radius for changed symbols ────────────────────
    const querySymbols = changedSymbols?.length
        ? changedSymbols
        : hubNodes.slice(0, 1).map(h => h.node.name);

    const affectedIds = new Set<string>();
    let maxHops = 0;
    for (const sym of querySymbols) {
        const matchingNodes = nodes.filter(n => n.name === sym);
        for (const mn of matchingNodes) {
            const blast = computeBlastRadius(mn.id, incoming);
            for (const id of blast) affectedIds.add(id);
            if (blast.size > maxHops) maxHops = Math.min(blast.size, 5);
        }
    }

    // ── Generate scores ─────────────────────────────────────
    const totalNodes = nodes.filter(n => n.label !== 'Module').length;
    const topHub = hubNodes[0];

    // Regression risk: based on how many nodes depend on hub nodes
    const regressionRisk = Math.min(10, Math.round(
        (topHub?.blastRadius ?? 0) / Math.max(totalNodes, 1) * 10 + 2
    ));

    // Architectural debt: based on coupling density and orphans
    const couplingDensity = functionalEdges.length / Math.max(totalNodes, 1);
    const orphanRatio = orphanNodes.length / Math.max(totalNodes, 1);
    const architecturalDebt = Math.min(10, Math.round(
        couplingDensity * 3 + orphanRatio * 5 + (fileComplexity.length > 5 ? 2 : 0)
    ));

    // Cognitive load: based on max fan-out and file count
    const maxFanOut = Math.max(...nodeRisks.map(n => n.outDegree), 0);
    const cognitiveLoad = Math.min(10, Math.round(
        maxFanOut * 1.5 + fileComplexity.length * 0.5
    ));

    // Risk level
    const avgScore = (regressionRisk + architecturalDebt + cognitiveLoad) / 3;
    let riskLevel: RiskLevel = 'LOW';
    if (avgScore >= 7) riskLevel = 'CRITICAL';
    else if (avgScore >= 5) riskLevel = 'HIGH';
    else if (avgScore >= 3) riskLevel = 'MEDIUM';

    // ── Build detailed summary ──────────────────────────────
    const summaryParts: string[] = [];

    if (topHub) {
        summaryParts.push(
            `"${topHub.node.name}" in ${topHub.node.file_path} is the highest-risk node with ${topHub.inDegree} direct dependents and a blast radius of ${topHub.blastRadius} transitively affected nodes.`
        );
    }

    if (fileComplexity.length > 0) {
        const mostComplex = fileComplexity[0];
        summaryParts.push(
            `${mostComplex.file} is the most complex file (${mostComplex.nodes} symbols, ${mostComplex.edges} cross-references).`
        );
    }

    if (orphanNodes.length > 0) {
        summaryParts.push(
            `${orphanNodes.length} dead/orphan symbol${orphanNodes.length > 1 ? 's' : ''} detected (${orphanNodes.map(n => n.name).slice(0, 3).join(', ')}${orphanNodes.length > 3 ? '…' : ''}) — unreachable code increases maintenance burden.`
        );
    }

    // ── Key concerns ────────────────────────────────────────
    const concerns: string[] = [];

    // Hub concentration
    if (topHub && topHub.inDegree >= 3) {
        concerns.push(
            `${topHub.node.name}() is a critical hub — ${topHub.inDegree} callers depend on it. Modifying its signature would cascade across ${topHub.blastRadius} downstream nodes.`
        );
    }

    // Tight coupling
    const tightlyCoupled = nodeRisks.filter(n => n.outDegree >= 3);
    if (tightlyCoupled.length > 0) {
        concerns.push(
            `${tightlyCoupled.length} function${tightlyCoupled.length > 1 ? 's' : ''} have high fan-out (≥3 dependencies): ${tightlyCoupled.slice(0, 3).map(n => n.node.name).join(', ')}. This indicates tight coupling.`
        );
    }

    // Missing abstractions
    if (fileComplexity.some(f => f.nodes > 8)) {
        const bigFiles = fileComplexity.filter(f => f.nodes > 8);
        concerns.push(
            `${bigFiles.map(f => f.file).join(', ')} ${bigFiles.length > 1 ? 'have' : 'has'} >8 symbols — consider extracting shared logic into separate modules.`
        );
    }

    // Orphan warning
    if (orphanNodes.length > 0) {
        concerns.push(
            `Orphan symbols: ${orphanNodes.map(n => `${n.name} (${n.file_path})`).join(', ')} — dead code should be removed to reduce cognitive load.`
        );
    }

    // Cross-file dependencies
    const crossFileEdges = functionalEdges.filter(e => {
        const srcNode = nodes.find(n => n.id === e.source_id);
        const tgtNode = nodes.find(n => n.id === e.target_id);
        return srcNode && tgtNode && srcNode.file_path !== tgtNode.file_path;
    });
    if (crossFileEdges.length > 0) {
        concerns.push(
            `${crossFileEdges.length} cross-file dependencies detected — changes in one file can silently break others. Key links: ${crossFileEdges.slice(0, 3).map(e => `${e.source_name}→${e.target_name}`).join(', ')}.`
        );
    }

    // Affected paths
    const affectedPaths = [...new Set(
        nodes.filter(n => affectedIds.has(n.id)).map(n => n.file_path)
    )];

    const audit: AuditResult = {
        regression_risk: regressionRisk,
        architectural_debt: architecturalDebt,
        cognitive_load: cognitiveLoad,
        risk_level: riskLevel,
        summary: summaryParts.join(' ') || 'Codebase analysis complete. No critical issues detected.',
        affected_paths: affectedPaths,
        key_concerns: concerns,
    };

    return {
        audit,
        blastRadius: {
            changed_nodes: querySymbols.length,
            affected_nodes: affectedIds.size,
            total_edges: functionalEdges.length,
            max_hop_distance: maxHops,
            symbols_queried: querySymbols,
        },
        hubNodes,
        orphanNodes,
        fileComplexity,
    };
}
