import { create } from 'zustand';
import { GraphNode, AuditResult } from '../types';

export type PaneState = {
    sizes: [number, number, number]; // percentages: left, center, right
    maximizedPane: 'left' | 'center' | 'right' | null;
};

interface YuktiState {
    // 1. Data Store
    fileContents: Record<string, string>;
    setFileContents: (contents: Record<string, string>) => void;

    // 2. Selection & Hover
    activeNode: GraphNode | null;
    setActiveNode: (node: GraphNode | null) => void;
    hoveredNode: GraphNode | null;
    setHoveredNode: (node: GraphNode | null) => void;

    // 3. Audit & Risk
    auditResults: AuditResult | null;
    setAuditResults: (results: AuditResult | null) => void;
    riskNodes: Set<string>; // IDs of high-risk nodes (vibrate)
    setRiskNodes: (nodes: Set<string>) => void;

    // 4. Layout
    paneState: PaneState;
    setPaneSizes: (sizes: [number, number, number]) => void;
    setMaximizedPane: (pane: 'left' | 'center' | 'right' | null) => void;

    // 5. Computed / Helpers
    breadcrumbs: string;
}

export const useYuktiStore = create<YuktiState>((set, get) => ({
    fileContents: {},
    setFileContents: (contents) => set({ fileContents: contents }),

    activeNode: null,
    setActiveNode: (node) => {
        set({ activeNode: node });
        const { activeNode } = get();
        if (activeNode) {
            const parts = activeNode.file_path.split('/');
            const breadcrumbs = `yukti / ${parts.slice(Math.max(parts.length - 3, 0)).join(' / ')} / ${activeNode.name}`;
            set({ breadcrumbs });
        } else {
            set({ breadcrumbs: 'yukti / workspace' });
        }
    },
    hoveredNode: null,
    setHoveredNode: (node) => set({ hoveredNode: node }),

    auditResults: null,
    setAuditResults: (results) => set({ auditResults: results }),
    riskNodes: new Set(),
    setRiskNodes: (nodes) => set({ riskNodes: nodes }),

    paneState: {
        sizes: [40, 35, 25], // Default triptych sizes
        maximizedPane: null,
    },
    setPaneSizes: (sizes) => set((state) => ({ paneState: { ...state.paneState, sizes } })),
    setMaximizedPane: (pane) => set((state) => ({ paneState: { ...state.paneState, maximizedPane: pane } })),

    breadcrumbs: 'yukti / workspace',
}));
