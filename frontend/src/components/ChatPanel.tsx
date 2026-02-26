/**
 * ChatPanel.tsx – AI Interaction Interface for Yuktham.
 * 
 * Provides a high-fidelity chat experience with Yukta (Guru Critic):
 * - Conversational UI: Manages message history and loading states.
 * - Markdown Rendering: Uses react-markdown + remark-gfm for professional formatting.
 * - API Integration: Bridges the frontend to the /api/chat GraphRAG endpoint.
 * - Persona: Implements the premium "Guru Critic" visual style and font stack.
 */
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = 'http://localhost:8000';

export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
}

export default function ChatPanel() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', content: 'Namaste! I am **Yukta**, your Guru Code Critic and Architectural Sentinel.\n\nUpload a codebase, and I will audit it for **Architectural Rot**, **AI Slop**, and high-stake risks. I am attuned to your tone—let us build something resilient.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Chat request failed');
            }

            const data = await res.json();
            setMessages(prev => [...prev, { role: 'model', content: data.response }]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'model', content: `**Error:** ${String(err)}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="chat-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--font-sans)' }}>
            {/* Header */}
            <div className="section-title" style={{ padding: '20px 24px 10px', margin: 0, borderBottom: '1px solid var(--border)', color: '#475569', fontSize: '11px', letterSpacing: '0.1em' }}>
                YUKTA WORKSPACE (SENTINEL CRITIC)
            </div>

            {/* Messages Area */}
            <div className="chat-messages" style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                background: 'linear-gradient(180deg, rgba(8, 8, 24, 0.95) 0%, rgba(13, 13, 31, 1) 100%)'
            }}>
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-bubble ${msg.role}`} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: msg.role === 'user' ? '80%' : '100%',
                        marginBottom: '4px'
                    }}>
                        {msg.role === 'model' && (
                            <div style={{
                                fontSize: '10px',
                                color: 'var(--blue-400)',
                                fontWeight: 800,
                                marginBottom: '8px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.15em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--blue-500)', boxShadow: '0 0 8px var(--blue-500)' }}></span>
                                YUKTA (GURU CRITIC)
                            </div>
                        )}
                        <div style={{
                            padding: msg.role === 'user' ? '12px 16px' : '0',
                            backgroundColor: msg.role === 'user' ? 'var(--blue-600)' : 'transparent',
                            borderRadius: '12px',
                            boxShadow: msg.role === 'user' ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
                            color: msg.role === 'user' ? '#fff' : '#cbd5e1',
                            fontSize: '15px'
                        }}>
                            {msg.role === 'user' ? (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            ) : (
                                <div className="markdown-content">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            h1: ({ node, ...props }) => <h1 style={{ fontSize: '1.4em', color: '#fff', margin: '16px 0 8px' }} {...props} />,
                                            h2: ({ node, ...props }) => <h2 style={{ fontSize: '1.2em', color: '#fff', margin: '14px 0 8px' }} {...props} />,
                                            h3: ({ node, ...props }) => <h3 style={{ fontSize: '1.1em', color: '#60a5fa', margin: '12px 0 6px' }} {...props} />,
                                            p: ({ node, ...props }) => <p style={{ margin: '0 0 12px', lineHeight: '1.7' }} {...props} />,
                                            li: ({ node, ...props }) => <li style={{ margin: '4px 0' }} {...props} />,
                                            ul: ({ node, ...props }) => <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }} {...props} />,
                                            code: ({ node, inline, ...props }: any) => (
                                                <code style={{
                                                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                                    color: '#60a5fa',
                                                    padding: inline ? '2px 4px' : '10px',
                                                    borderRadius: '6px',
                                                    display: inline ? 'inline' : 'block',
                                                    fontFamily: 'var(--font-mono)',
                                                    fontSize: '0.9em',
                                                    overflowX: 'auto',
                                                    border: inline ? 'none' : '1px solid rgba(59, 130, 246, 0.2)'
                                                }} {...props} />
                                            )
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="chat-bubble model" style={{ alignSelf: 'flex-start' }}>
                        <div className="typing-indicator" style={{ display: 'flex', gap: 6, padding: '10px' }}>
                            <span style={{ animation: 'blink 1.4s infinite both', color: 'var(--blue-400)' }}>●</span>
                            <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.2s', color: 'var(--blue-400)' }}>●</span>
                            <span style={{ animation: 'blink 1.4s infinite both', animationDelay: '0.4s', color: 'var(--blue-400)' }}>●</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="chat-input-area" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-panel)' }}>
                <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Audit the architecture..."
                        style={{
                            flex: 1,
                            backgroundColor: 'rgba(0,0,0,0.3)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '12px 40px 12px 16px',
                            color: '#fff',
                            fontSize: '14px',
                            fontFamily: 'var(--font-sans)',
                            resize: 'none',
                            height: '48px',
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        style={{
                            position: 'absolute',
                            right: '8px',
                            top: '8px',
                            width: '32px',
                            height: '32px',
                            backgroundColor: input.trim() && !isLoading ? 'var(--blue-600)' : 'transparent',
                            color: input.trim() && !isLoading ? '#fff' : '#475569',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                    >
                        ↑
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }
                .markdown-content ul, .markdown-content ol { margin-bottom: 12px; }
            `}</style>
        </div>
    );
}
