// types.ts – Shared TypeScript types for Yuktham frontend

export type NodeLabel = 'Function' | 'Class' | 'Module' | 'Variable' | 'UnresolvedSymbol';
export type EdgeType = 'CALLS' | 'IMPORTS' | 'INHERITS' | 'DEFINES';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GraphNode {
    id: string;
    name: string;
    label: NodeLabel;
    file_path: string;
    line_start: number;
    line_end: number;
    version_id: string;
    language?: string;
    hop_distance?: number;
    // UI state
    blastAffected?: boolean;
    changed?: boolean;
}

export interface GraphEdge {
    source_id: string;
    source_name: string;
    relationship: EdgeType;
    target_id: string;
    target_name: string;
    file_path: string;
    line: number;
}

export interface BlastRadiusSummary {
    changed_nodes: number;
    affected_nodes: number;
    total_edges: number;
    max_hop_distance: number;
    symbols_queried: string[];
}

export interface AuditResult {
    regression_risk: number;
    architectural_debt: number;
    cognitive_load: number;
    risk_level: RiskLevel;
    summary: string;
    affected_paths: string[];
    key_concerns: string[];
}

export interface AuditResponse {
    audit: AuditResult;
    blast_radius_summary: BlastRadiusSummary;
    version_id: string;
}

export interface D3Node extends GraphNode {
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
    vx?: number;
    vy?: number;
}

export interface D3Edge {
    source: D3Node | string;
    target: D3Node | string;
    relationship: EdgeType;
    file_path: string;
    line: number;
}
