import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('앱 렌더 에러:', error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full">
                        <div className="text-4xl mb-3 text-center">⚠️</div>
                        <h2 className="text-lg font-bold text-red-600 text-center mb-2">화면 오류</h2>
                        <p className="text-sm text-slate-600 mb-4 text-center">앱 화면 렌더링 중 문제가 발생했습니다.</p>
                        <details className="text-xs text-slate-500 mb-4 bg-slate-50 rounded-lg p-3 overflow-auto max-h-40">
                            <summary className="cursor-pointer font-semibold mb-1">오류 내용 보기</summary>
                            <pre className="whitespace-pre-wrap break-all mt-2">
                                {this.state.error?.toString()}
                                {'\n\n'}
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </details>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-2 bg-blue-600 text-white rounded-xl text-sm font-bold"
                        >
                            새로고침
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
