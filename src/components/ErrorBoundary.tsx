import { Component, ErrorInfo, ReactNode } from "react";
import styles from './ErrorBoundary.module.css';
import { AlertTriangle, RefreshCw, Home, Download, WifiOff } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    componentName?: string;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
    isOnline: boolean;
    errorCount: number;
}

interface ErrorReport {
    timestamp: string;
    error: string;
    errorStack?: string;
    componentStack?: string;
    componentName?: string;
    userAgent: string;
    url: string;
    isOnline: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        isOnline: navigator.onLine,
        errorCount: 0
    };

    private onlineListener: (() => void) | null = null;
    private offlineListener: (() => void) | null = null;

    componentDidMount() {
        // Listen for online/offline changes
        this.onlineListener = () => this.setState({ isOnline: true });
        this.offlineListener = () => this.setState({ isOnline: false });
        
        window.addEventListener('online', this.onlineListener);
        window.addEventListener('offline', this.offlineListener);
    }

    componentWillUnmount() {
        if (this.onlineListener) {
            window.removeEventListener('online', this.onlineListener);
        }
        if (this.offlineListener) {
            window.removeEventListener('offline', this.offlineListener);
        }
    }

    public static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
        
        this.setState(prevState => ({
            errorInfo,
            errorCount: prevState.errorCount + 1
        }));

        // Report error
        this.reportError(error, errorInfo);

        // Call custom error handler if provided
        this.props.onError?.(error, errorInfo);

        // If error count is too high, something is seriously wrong
        if (this.state.errorCount > 3) {
            console.error("[ErrorBoundary] Too many errors, suggesting app restart");
        }
    }

    private reportError(error: Error, errorInfo: ErrorInfo): void {
        try {
            const report: ErrorReport = {
                timestamp: new Date().toISOString(),
                error: error.message,
                errorStack: error.stack || undefined,
                componentStack: errorInfo.componentStack || undefined,
                componentName: this.props.componentName,
                userAgent: navigator.userAgent,
                url: window.location.href,
                isOnline: navigator.onLine
            };

            // Store error report locally for debugging
            const existingReports = JSON.parse(localStorage.getItem('whoap_error_reports') || '[]');
            existingReports.push(report);
            
            // Keep only last 10 reports
            if (existingReports.length > 10) {
                existingReports.shift();
            }
            
            localStorage.setItem('whoap_error_reports', JSON.stringify(existingReports));

            // Send to analytics if online (optional)
            if (navigator.onLine) {
                // Could send to error tracking service here
                console.log('[ErrorBoundary] Error report stored:', report);
            }
        } catch (e) {
            console.error('[ErrorBoundary] Failed to report error:', e);
        }
    }

    private handleReset = () => {
        this.props.onReset?.();
        this.setState({ 
            hasError: false, 
            error: undefined, 
            errorInfo: undefined 
        });
    };

    private handleReload = () => {
        window.location.reload();
    };

    private handleGoHome = () => {
        // Navigate to home by changing URL hash or emitting event
        window.location.hash = '';
        this.handleReset();
    };

    private handleExportReport = () => {
        try {
            const reports = localStorage.getItem('whoap_error_reports') || '[]';
            const blob = new Blob([reports], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `whoap-error-report-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to export error report:', e);
        }
    };

    private getErrorDescription(): string {
        const { error } = this.state;
        if (!error) return 'An unexpected error occurred';

        const message = error.message.toLowerCase();
        
        // Common error patterns
        if (message.includes('network') || message.includes('fetch') || message.includes('internet')) {
            return 'Network connection issue. Please check your internet connection.';
        }
        if (message.includes('quota') || message.includes('storage')) {
            return 'Storage limit reached. Try clearing some cache or freeing up disk space.';
        }
        if (message.includes('memory') || message.includes('out of memory')) {
            return 'Out of memory. Please close some applications and try again.';
        }
        if (message.includes('permission') || message.includes('access denied')) {
            return 'Permission denied. The app may not have access to required resources.';
        }
        if (message.includes('timeout')) {
            return 'Operation timed out. The server may be slow or unreachable.';
        }
        
        return error.message;
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const isOffline = !this.state.isOnline;
            const errorDescription = this.getErrorDescription();
            const componentName = this.props.componentName || 'this component';

            return (
                <div className={styles.container}>
                    <div className={styles.content}>
                        <div className={styles.iconWrapper}>
                            {isOffline ? (
                                <WifiOff className={styles.icon} size={48} />
                            ) : (
                                <AlertTriangle className={styles.icon} size={48} />
                            )}
                        </div>

                        <h2 className={styles.title}>
                            {isOffline ? 'You\'re Offline' : 'Something Went Wrong'}
                        </h2>

                        <p className={styles.description}>
                            {isOffline 
                                ? 'It looks like you\'ve lost your internet connection. Some features may not work properly until you\'re back online.'
                                : errorDescription
                            }
                        </p>

                        {this.state.errorCount > 1 && (
                            <div className={styles.warning}>
                                <AlertTriangle size={16} />
                                <span>This has happened {this.state.errorCount} times. Consider restarting the app.</span>
                            </div>
                        )}

                        <div className={styles.actions}>
                            <button
                                onClick={this.handleReset}
                                className={styles.primaryBtn}
                                disabled={this.state.errorCount > 5}
                            >
                                <RefreshCw size={18} />
                                Try Again
                            </button>

                            <button
                                onClick={this.handleReload}
                                className={styles.secondaryBtn}
                            >
                                <RefreshCw size={18} />
                                Reload App
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className={styles.secondaryBtn}
                            >
                                <Home size={18} />
                                Go to Home
                            </button>

                            <button
                                onClick={this.handleExportReport}
                                className={styles.tertiaryBtn}
                            >
                                <Download size={18} />
                                Export Error Report
                            </button>
                        </div>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className={styles.debugInfo}>
                                <h4>Debug Information</h4>
                                <pre className={styles.errorStack}>
                                    {this.state.error.stack}
                                </pre>
                                {this.state.errorInfo?.componentStack && (
                                    <pre className={styles.componentStack}>
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        )}

                        <p className={styles.footer}>
                            Component: {componentName} | 
                            Status: {isOffline ? 'Offline' : 'Online'} |
                            Time: {new Date().toLocaleTimeString()}
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Hook for functional components to catch async errors
export function useErrorHandler() {
    return (error: Error, errorInfo?: ErrorInfo) => {
        console.error('[useErrorHandler] Caught error:', error, errorInfo);
        
        // Store error for boundary to catch
        const event = new ErrorEvent('error', {
            error,
            message: error.message
        });
        window.dispatchEvent(event);
    };
}
