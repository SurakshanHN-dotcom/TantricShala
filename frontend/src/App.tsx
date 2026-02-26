/**
 * App.tsx – Main Application Controller for Yuktham.
 * 
 * Orchestrates the overall layout, file ingestion pipeline, and state synchronization:
 * - File Ingestion: Handles drag-and-drop or picker-based multi-file/folder selection.
 * - Neo4j Sync: Triggers backend ingestion and refreshes the D3 graph view.
 * - Reactive UI: Manages the resizable sidebar, node selection, and upload status.
 * - Integration: Hosts the GraphView (D3.js) and the ChatPanel (Yukta/Gemini).
 */
import React, { useState, useCallback, useEffect } from 'react';
import GraphView from './components/GraphView';
import ChatPanel from './components/ChatPanel';
import { GraphNode, GraphEdge } from './types';
import './index.css';

const MOCK_NODES: GraphNode[] = [];
const MOCK_EDGES: GraphEdge[] = [];
const API_BASE = 'http://localhost:8000';

function traverseEntry(entry: any, allFiles: File[], onDone: () => void) {
    if (entry.isFile) {
        entry.file((file: File) => {
            allFiles.push(file);
            onDone();
        });
    } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries: any[] = [];
        const readEntries = () => {
            dirReader.readEntries((results: any[]) => {
                if (!results.length) {
                    processEntries(entries);
                } else {
                    entries.push(...results);
                    readEntries();
                }
            }, onDone);
        };
        const processEntries = (arr: any[]) => {
            if (arr.length === 0) return onDone();
            let pending = arr.length;
            const checkDone = () => { if (--pending === 0) onDone(); };
            arr.forEach((e) => traverseEntry(e, allFiles, checkDone));
        };
        readEntries();
    } else {
        onDone();
    }
}

export default function App() {
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>(MOCK_NODES);
    const [graphEdges, setGraphEdges] = useState<GraphEdge[]>(MOCK_EDGES);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

    const [dragging, setDragging] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<{ state: 'idle' | 'loading' | 'ok' | 'err'; message: string }>({ state: 'idle', message: '' });
    const [parseStats, setParseStats] = useState<string | null>(null);

    const [sidebarWidth, setSidebarWidth] = useState(380);
    const [isResizing, setIsResizing] = useState(false);

    // Initial graph load
    useEffect(() => {
        fetchGraph();
    }, []);

    useEffect(() => {
        if (!isResizing) return;
        const handleMouseMove = (e: MouseEvent) => {
            let newWidth = window.innerWidth - e.clientX;
            if (newWidth < 250) newWidth = 250;
            if (newWidth > 800) newWidth = 800;
            setSidebarWidth(newWidth);
        };
        const handleMouseUp = () => {
            setIsResizing(false);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const fetchGraph = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/graph`);
            if (res.ok) {
                const data = await res.json();
                if (data.nodes && data.nodes.length > 0) {
                    setGraphNodes(data.nodes);
                    setGraphEdges(data.edges);
                }
            }
        } catch (e) {
            console.error('Failed to fetch initial graph:', e);
        }
    };

    const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        setUploadStatus({ state: 'loading', message: 'Reading files...' });

        const fileContents: Record<string, string> = {};
        let count = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const name = file.webkitRelativePath || file.name;
            if (name.startsWith('.') || name.includes('/.')) continue;

            try {
                const text = await file.text();
                fileContents[name] = text;
                count++;
            } catch (err) {
                console.warn(`Could not read ${name}:`, err);
            }
        }

        if (count === 0) {
            setUploadStatus({ state: 'err', message: 'No readable text files found' });
            return;
        }

        setUploadStatus({ state: 'loading', message: 'Parsing and ingesting to Neo4j...' });

        try {
            const res = await fetch(`${API_BASE}/api/upload-folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: fileContents })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Upload failed');
            }

            setParseStats(`${data.parse_stats.nodes_extracted} nodes, ${data.parse_stats.edges_extracted} edges`);
            setUploadStatus({
                state: 'ok',
                message: `✓ Ingested: ${count} files.`,
            });

            // Refresh graph
            await fetchGraph();

        } catch (e: any) {
            setUploadStatus({ state: 'err', message: `Upload failed: ${e.message}` });
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const items = e.dataTransfer.items;
        if (items && items.length > 0) {
            const allFiles: File[] = [];
            let pending = 0;
            const checkDone = () => { if (pending === 0 && allFiles.length > 0) handleUploadFiles(allFiles); };
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry?.();
                if (entry) {
                    pending++;
                    traverseEntry(entry, allFiles, () => { pending--; checkDone(); });
                } else {
                    const file = items[i].getAsFile();
                    if (file) allFiles.push(file);
                }
            }
            if (pending === 0 && allFiles.length > 0) handleUploadFiles(allFiles);
            else if (pending === 0) handleUploadFiles(e.dataTransfer.files);
        } else {
            handleUploadFiles(e.dataTransfer.files);
        }
    }, [handleUploadFiles]);

    const openFilePicker = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file'; input.multiple = true;
        input.onchange = () => { if (input.files) handleUploadFiles(input.files); };
        input.click();
    }, [handleUploadFiles]);

    const openFolderPicker = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        (input as any).webkitdirectory = true;
        input.onchange = () => { if (input.files) handleUploadFiles(input.files); };
        input.click();
    }, [handleUploadFiles]);

    return (
        <div className={`app ${isResizing ? 'resizing-sidebar' : ''}`} style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}>
            {/* ── Header ──────────────────────────────────── */}
            <header className="header">
                <div className="header-logo">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <circle cx="14" cy="14" r="13" stroke="#3b82f6" strokeWidth="1.5" opacity="0.4" />
                        <path d="M14 6L6 22h16L14 6z" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
                        <circle cx="14" cy="14" r="3" fill="#ef4444" />
                        <path d="M14 11v6M11 14h6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
                    </svg>
                    <div>
                        <div className="header-title">Yuktham</div>
                        <div className="header-subtitle">Architectural Blast-Radius Sentinel (Neo4j Edition)</div>
                    </div>
                </div>
                <div className="header-spacer" />
                {parseStats && (
                    <div className="mock-badge active" style={{ color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}>
                        📊 {parseStats}
                    </div>
                )}
            </header>

            {/* ── Graph Canvas ────────────────────────────── */}
            <GraphView
                nodes={graphNodes}
                edges={graphEdges}
                blastNodeIds={new Set()}
                changedNodeIds={new Set()}
                onNodeSelect={setSelectedNode}
            />

            {/* ── Sidebar Resizer ─────────────────────────── */}
            <div
                className={`sidebar-resizer ${isResizing ? 'resizing' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
            />

            {/* ── Sidebar ─────────────────────────────────── */}
            <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ flexShrink: 0 }}>
                    {/* Node Inspector */}
                    <div className="sidebar-section">
                        <div className="section-title">Node Inspector</div>
                        {selectedNode ? (
                            <div className="inspector">
                                <div className="inspector-row"><span className="inspector-key">Name</span><span className="inspector-val">{selectedNode.name}</span></div>
                                <div className="inspector-row"><span className="inspector-key">Type</span><span className={`label-chip ${selectedNode.label}`}>{selectedNode.label}</span></div>
                                <div className="inspector-row"><span className="inspector-key">File</span><span className="inspector-val">{selectedNode.file_path}</span></div>
                                <div className="inspector-row"><span className="inspector-key">Lines</span><span className="inspector-val">{selectedNode.line_start}–{selectedNode.line_end}</span></div>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: '8px 0' }}>
                                <span className="icon">🔍</span><span>Click any node to inspect</span>
                            </div>
                        )}
                    </div>

                    {/* Upload Panel */}
                    <div className="sidebar-section">
                        <div className="section-title">Upload Codebase</div>
                        <div
                            className={`upload-zone${dragging ? ' dragging' : ''}`}
                            style={{ padding: '16px 12px' }}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                        >
                            <div className="upload-icon" style={{ fontSize: 24, marginBottom: 4 }}>📦</div>
                            <p style={{ margin: 0, fontSize: 13 }}>Drop <span>files, folders, or .zip</span> here</p>
                            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                                <button className="toggle-btn" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); openFilePicker(); }}>📄 Files</button>
                                <button className="toggle-btn" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); openFolderPicker(); }}>📁 Folder</button>
                            </div>
                        </div>
                        {uploadStatus.state !== 'idle' && (
                            <div className={`upload-status ${uploadStatus.state === 'ok' ? 'ok' : uploadStatus.state === 'err' ? 'err' : 'loading'}`} style={{ marginTop: 8 }}>
                                {uploadStatus.state === 'ok' ? '✓' : uploadStatus.state === 'err' ? '✕' : '⟳'} {uploadStatus.message}
                            </div>
                        )}
                    </div>
                </div>

                {/* Chat Panel - Takes up remaining space */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <ChatPanel />
                </div>
            </aside>
        </div>
    );
}
