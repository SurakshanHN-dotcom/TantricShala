import React from 'react';

interface CommandStripProps {
    breadcrumbs: string;
    onUpload?: (files: FileList | File[]) => void;
}

export default function CommandStrip({ breadcrumbs, onUpload }: CommandStripProps) {
    const handleUploadClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        (input as any).webkitdirectory = true;
        input.multiple = true;
        input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && onUpload) {
                onUpload(files);
            }
        };
        input.click();
    };

    // Parse breadcrumbs for styling
    const parts = breadcrumbs.split(' / ');

    return (
        <header className="command-strip">
            <div className="command-logo">
                YUKTI
            </div>

            <div className="command-breadcrumbs">
                {parts.map((p, i) => (
                    <React.Fragment key={i}>
                        <span className={i === parts.length - 1 ? 'active' : ''}>{p}</span>
                        {i < parts.length - 1 && <span style={{ margin: '0 8px', color: '#444' }}>/</span>}
                    </React.Fragment>
                ))}
            </div>

            <div className="command-actions">
                <button
                    className="action-icon"
                    title="Upload Codebase Folder"
                    onClick={handleUploadClick}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </button>

                <button className="action-icon" title="Git Branch (Mock)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="6" y1="3" x2="6" y2="15"></line>
                        <circle cx="18" cy="6" r="3"></circle>
                        <circle cx="6" cy="18" r="3"></circle>
                        <path d="M18 9a9 9 0 0 1-9 9"></path>
                    </svg>
                </button>

                <button className="action-icon" title="Architecture Rot Heatmap Toggle">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </button>

                {/* Circular Progress (Integrity) */}
                <div className="health-meter" title="Project Integrity %">
                    <svg width="24" height="24" viewBox="0 0 36 36">
                        <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="3"
                        />
                        <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="var(--cyan-neon)"
                            strokeWidth="3"
                            strokeDasharray="85, 100"
                        />
                    </svg>
                </div>
            </div>
        </header>
    );
}
