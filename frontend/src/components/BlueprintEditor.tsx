import React, { useRef, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useYuktiStore } from '../store/useYuktiStore';

export default function BlueprintEditor() {
    const { activeNode, fileContents, setMaximizedPane, paneState } = useYuktiStore();
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);
    const decorationsRef = useRef<string[]>([]);

    const isMaximized = paneState.maximizedPane === 'left';

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;

        // Define Custom Theme
        monaco.editor.defineTheme('yukti-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { background: '0D0D14' },
                { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
                { token: 'keyword', foreground: '00F0FF' },
                { token: 'string', foreground: '34D399' },
            ],
            colors: {
                'editor.background': '#0D0D14',
                'editor.lineHighlightBackground': '#1A1C29',
                'editorLineNumber.foreground': '#475569',
                'editorIndentGuide.background': '#1E293B',
                'editorIndentGuide.activeBackground': '#3388FF',
            }
        });
        monaco.editor.setTheme('yukti-dark');
    };

    // Auto-scroll when activeNode changes
    useEffect(() => {
        if (!editorRef.current || !activeNode || !monaco) return;

        // Scroll to the line
        editorRef.current.revealLineInCenter(activeNode.line_start);
        editorRef.current.setPosition({ lineNumber: activeNode.line_start, column: 1 });

        // Add a temporary highlight decoration for the range
        const newDecorations = [
            {
                range: new monaco.Range(activeNode.line_start, 1, activeNode.line_end, 1),
                options: {
                    isWholeLine: true,
                    className: 'node-highlight',
                    marginClassName: activeNode.blastAffected ? 'critique-marker' : ''
                }
            }
        ];

        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);

    }, [activeNode, monaco]);

    let currentFileContent = '// No file selected.\n// Click a node in the Galaxy to view source.';
    let currentLanguage = 'typescript';

    if (activeNode && fileContents[activeNode.file_path]) {
        currentFileContent = fileContents[activeNode.file_path];

        // Basic extension to language mapping
        const ext = activeNode.file_path.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            'ts': 'typescript', 'tsx': 'typescript',
            'js': 'javascript', 'jsx': 'javascript',
            'py': 'python',
            'json': 'json',
            'html': 'html',
            'css': 'css',
            'md': 'markdown'
        };
        if (ext && langMap[ext]) {
            currentLanguage = langMap[ext];
        } else {
            currentLanguage = 'plaintext';
        }
    }

    return (
        <div className="blueprint-container absolute inset-0 flex flex-col">
            {/* Header */}
            <div className="pane-header">
                <div className="pane-title text-[11px] font-mono font-semibold tracking-widest text-slate-400 uppercase">
                    Blueprint <span className="text-slate-600 lowercase ml-2">{activeNode?.file_path || 'empty'}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        className="maximize-btn"
                        onClick={() => setMaximizedPane(isMaximized ? null : 'left')}
                        title={isMaximized ? "Restore" : "Maximize Blueprint"}
                    >
                        {isMaximized ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Monaco Editor */}
            <div className="pane-content relative flex-1">
                <Editor
                    height="100%"
                    language={currentLanguage}
                    value={currentFileContent}
                    theme="yukti-dark"
                    onMount={handleEditorDidMount}
                    options={{
                        readOnly: true,
                        minimap: { enabled: true, renderCharacters: false, scale: 0.75 },
                        fontSize: 13,
                        fontFamily: 'JetBrains Mono, monospace',
                        lineHeight: 22,
                        padding: { top: 16, bottom: 16 },
                        scrollBeyondLastLine: true,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        formatOnPaste: false,
                        renderLineHighlight: 'all',
                        scrollbar: {
                            verticalScrollbarSize: 8,
                            horizontalScrollbarSize: 8
                        },
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true
                    }}
                />
            </div>

            <style>{`
                .node-highlight { background-color: rgba(51, 136, 255, 0.1); }
            `}</style>
        </div>
    );
}
