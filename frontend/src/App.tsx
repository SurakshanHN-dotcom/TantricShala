import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useYuktiStore } from './store/useYuktiStore';
import CommandStrip from './components/CommandStrip';
import GalaxyViewport from './components/GalaxyViewport';
import BlueprintEditor from './components/BlueprintEditor';
import SentinelHUD from './components/SentinelHUD';
import { GraphNode, GraphEdge } from './types';
import './index.css';

const API_BASE = 'http://localhost:8000';

export default function App() {
    const { paneState, setPaneSizes, setFileContents, breadcrumbs } = useYuktiStore();
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
    const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);

    const [isResizing, setIsResizing] = useState<'left-center' | 'center-right' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial graph load
    useEffect(() => {
        fetchGraph();
    }, []);

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

    // Global Keybinds
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey && e.key === 'u') {
                e.preventDefault();
                document.getElementById('yukti-upload-input')?.click();
            }
            if (e.metaKey && e.key === 'g') {
                e.preventDefault();
                // Focus graph (mock logic)
                useYuktiStore.getState().setMaximizedPane('left');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Resize Logic
    useEffect(() => {
        if (!isResizing || !containerRef.current) return;

        const handleMouseMove = (e: MouseEvent) => {
            const containerWidth = containerRef.current!.offsetWidth;
            const [w1, w2, w3] = paneState.sizes;

            const clientX = Math.max(0, Math.min(e.clientX, containerWidth));
            const totalPercent = (clientX / containerWidth) * 100;

            if (isResizing === 'left-center') {
                // Adjust left pane, keep right pane fixed
                const newLeft = Math.max(15, Math.min(totalPercent, 100 - w3 - 15));
                const newCenter = 100 - newLeft - w3;
                setPaneSizes([newLeft, newCenter, w3]);
            } else if (isResizing === 'center-right') {
                // Adjust right pane, keep left pane fixed
                const newRight = 100 - Math.max(w1 + 15, Math.min(totalPercent, 85));
                const newCenter = 100 - w1 - newRight;
                setPaneSizes([w1, newCenter, newRight]);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(null);
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isResizing, paneState.sizes, setPaneSizes]);

    const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        console.log(`Uploading ${files.length} files...`);

        const fileContents: Record<string, string> = {};
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const name = file.webkitRelativePath || file.name;
            if (name.startsWith('.') || name.includes('/.')) continue;

            try {
                const text = await file.text();
                fileContents[name] = text;
            } catch (err) {
                console.warn(`Could not read ${name}:`, err);
            }
        }

        // Save to store for the code editor
        setFileContents(fileContents);

        try {
            const res = await fetch(`${API_BASE}/api/upload-folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: fileContents })
            });

            if (res.ok) {
                await fetchGraph();
            }
        } catch (e: any) {
            console.error('Upload failed:', e);
        }
    }, [setFileContents]);

    const isMax = paneState.maximizedPane;
    const [w1, w2, w3] = paneState.sizes;

    return (
        <div className="app-container">
            {/* Header (Command Strip) */}
            <CommandStrip breadcrumbs={breadcrumbs} onUpload={handleUploadFiles} />

            {/* Main Triptych Layout */}
            <div className="triptych-container" ref={containerRef}>

                {/* 1. Blueprint Editor (Left) */}
                <div
                    className={`pane ${isMax && isMax !== 'left' ? 'hidden' : ''}`}
                    style={{ width: isMax === 'left' ? '100%' : `${w1}%` }}
                >
                    <BlueprintEditor />
                </div>

                {/* Sash 1 */}
                {!isMax && (
                    <div
                        className={`sash ${isResizing === 'left-center' ? 'active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); setIsResizing('left-center'); }}
                    />
                )}

                {/* 2. Galaxy Viewport (Center) */}
                <div
                    className={`pane ${isMax && isMax !== 'center' ? 'hidden' : ''}`}
                    style={{ width: isMax === 'center' ? '100%' : `${w2}%` }}
                >
                    <GalaxyViewport nodes={graphNodes} edges={graphEdges} />
                </div>

                {/* Sash 2 */}
                {!isMax && (
                    <div
                        className={`sash ${isResizing === 'center-right' ? 'active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); setIsResizing('center-right'); }}
                    />
                )}

                {/* 3. Sentinel HUD (Right) */}
                <div
                    className={`pane ${isMax && isMax !== 'right' ? 'hidden' : ''}`}
                    style={{ width: isMax === 'right' ? '100%' : `${w3}%` }}
                >
                    <SentinelHUD />
                </div>
            </div>

            {/* Hidden Input for file uploads */}
            <input
                type="file"
                id="yukti-upload-input"
                multiple
                {...({ webkitdirectory: true } as any)}
                className="hidden-input"
                onChange={(e) => { if (e.target.files) handleUploadFiles(e.target.files); }}
            />
        </div>
    );
}
