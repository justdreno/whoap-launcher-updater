import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div style={{ padding: 40, color: 'white', background: '#111', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h2>Something went wrong.</h2>
                    <p style={{ color: '#888', marginBottom: 20 }}>{this.state.error?.message}</p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        style={{ padding: '10px 20px', background: '#ff8800', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
