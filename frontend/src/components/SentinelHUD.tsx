import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useYuktiStore } from '../store/useYuktiStore';
import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend
);

const API_BASE = 'http://localhost:8000';

export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

export default function SentinelHUD() {
    const { paneState, setMaximizedPane, activeNode, auditResults } = useYuktiStore();
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', content: '[LOGIC] Namaste! I am the Yukti Sentinel.\n\nUpload a codebase, and I will audit it for **Architectural Rot** and high-stake risks. I am attuned to your tone.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const isMaximized = paneState.maximizedPane === 'right';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: input.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg.content,
                    history: messages.filter(m => m.role === 'user' || m.role === 'model')
                }),
            });

            if (!res.ok) throw new Error('Chat request failed');

            const data = await res.json();
            setMessages(prev => [...prev, { role: 'model', content: data.response }]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'model', content: `[RISK] **Error:** Connection to Cortex lost.` }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Radar Chart Data processing
    const processMetrics = () => {
        // Defaults if no audit results
        let coupling = 20, cohesion = 80, churn = 10;

        if (auditResults) {
            // Mapping old metrics to new radar format
            coupling = Math.min(100, auditResults.architectural_debt * 10);
            cohesion = Math.max(10, 100 - (auditResults.cognitive_load * 5));
            churn = Math.min(100, auditResults.regression_risk * 10);
        }

        return {
            labels: ['Coupling', 'Cohesion', 'Churn'],
            datasets: [
                {
                    label: 'Risk Profile',
                    data: [coupling, cohesion, churn],
                    backgroundColor: 'rgba(255, 170, 0, 0.2)', // Amber
                    borderColor: 'rgba(255, 170, 0, 1)',
                    borderWidth: 1,
                    pointBackgroundColor: '#FFAA00',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#FFAA00',
                },
            ],
        };
    };

    const radarOptions = {
        scales: {
            r: {
                angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                pointLabels: { color: '#888', font: { family: 'JetBrains Mono', size: 10 } },
                ticks: { display: false, max: 100, min: 0 }
            }
        },
        plugins: {
            legend: { display: false }
        },
        maintainAspectRatio: false
    };

    // Custom Markdown renderer to style Risk/Logic tags
    const renderMarkdown = (content: string) => {
        let processedContent = content;
        let headerCls = '';
        let headerText = '';

        if (content.startsWith('[LOGIC]')) {
            processedContent = content.substring(7).trim();
            headerCls = 'LOGIC';
            headerText = 'LOGIC';
        } else if (content.startsWith('[RISK]')) {
            processedContent = content.substring(6).trim();
            headerCls = 'RISK';
            headerText = 'RISK';
        } else if (content.startsWith('[HISTORY]')) {
            processedContent = content.substring(9).trim();
            headerCls = 'HISTORY';
            headerText = 'HISTORY';
        }

        return (
            <div className="chat-msg">
                {headerText && <div className={`msg-header ${headerCls}`}>{headerText}</div>}
                <div className="msg-box">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code: ({ node, inline, children, ...props }: any) => (
                                inline
                                    ? <code style={{ color: '#00F0FF', backgroundColor: 'rgba(0, 240, 255, 0.1)', padding: '2px 4px', borderRadius: '4px', fontFamily: 'JetBrains Mono' }} {...props}>{children}</code>
                                    : <pre style={{ backgroundColor: '#05050A', padding: '12px', borderRadius: '6px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.1)', marginTop: '8px' }}><code style={{ color: '#E0E0E0', fontFamily: 'JetBrains Mono', fontSize: '12px' }} {...props}>{children}</code></pre>
                            )
                        }}
                    >
                        {processedContent}
                    </ReactMarkdown>
                </div>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 flex flex-col">
            {/* Header */}
            <div className="pane-header">
                <div className="pane-title">
                    Sentinel
                </div>
                <button
                    className="maximize-btn"
                    onClick={() => setMaximizedPane(isMaximized ? null : 'right')}
                    title={isMaximized ? "Restore" : "Maximize Sentinel"}
                >
                    {isMaximized ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
                    )}
                </button>
            </div>

            <div className="pane-content flex flex-col flex-1">
                <div className="sentinel-scroll flex-1">

                    {/* Radar Chart Scoreboard */}
                    <div className="radar-card">
                        <div className="radar-title">RISK SCOREBOARD</div>
                        <div style={{ height: '140px', width: '100%', position: 'relative' }}>
                            <Radar data={processMetrics()} options={radarOptions} />
                        </div>
                    </div>

                    {/* Chat History */}
                    <div className="flex flex-col gap-4 mt-2">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'user-msg' : 'model-msg'}`}>
                                {msg.role === 'user' ? (
                                    <div className="msg-box">{msg.content}</div>
                                ) : (
                                    renderMarkdown(msg.content)
                                )}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-1 p-3">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '200ms' }}></span>
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '400ms' }}></span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area */}
                <div className="sentinel-input-wrap">
                    <textarea
                        className="sentinel-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Audit the architecture..."
                    />
                    <button
                        className="sentinel-send-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
