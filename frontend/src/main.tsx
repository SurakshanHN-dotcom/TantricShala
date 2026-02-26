import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state = { error: null as Error | null }

    static getDerivedStateFromError(error: Error) {
        return { error }
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{
                    padding: 40, fontFamily: 'monospace', color: '#f87171',
                    background: '#0a0a1a', height: '100vh', overflow: 'auto',
                }}>
                    <h1 style={{ color: '#ef4444', marginBottom: 16 }}>⚠ Yuktham Runtime Error</h1>
                    <pre style={{
                        background: '#111', padding: 20, borderRadius: 8,
                        border: '1px solid #333', whiteSpace: 'pre-wrap', fontSize: 13,
                    }}>
                        {this.state.error.message}
                        {'\n\n'}
                        {this.state.error.stack}
                    </pre>
                </div>
            )
        }
        return this.props.children
    }
}

const root = document.getElementById('root')
if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>,
    )
} else {
    document.body.innerHTML = '<h1 style="color:red;padding:40px">No #root element found</h1>'
}
