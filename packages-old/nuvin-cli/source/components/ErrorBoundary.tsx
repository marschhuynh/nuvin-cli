import type React from 'react';
import { Component } from 'react';
import type { MemoryPort } from '@nuvin/nuvin-core';
import { autoExportHistory } from '@/utils/autoExport.js';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  memory?: MemoryPort | null;
}

interface State {
  hasError: boolean;
  error?: Error;
  exportPath?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error);
    console.error('Error info:', errorInfo);

    if (error.message.includes('memory access out of bounds') || error.message.includes('wasm')) {
      console.warn('WASM memory access error detected, app will continue with safe fallback');
    }

    if (this.props.memory) {
      const exportPath = await autoExportHistory(this.props.memory, `Application error: ${error.message}`);

      if (exportPath) {
        console.log(`\n✓ Conversation history auto-exported to: ${exportPath}`);
        this.setState({ exportPath });
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div style={{ padding: '1rem', color: 'red' }}>
            <h3>Something went wrong</h3>
            <p>The application encountered an error but will continue running.</p>
            {this.state.exportPath && (
              <p style={{ color: 'green', marginTop: '0.5rem' }}>✓ History exported to: {this.state.exportPath}</p>
            )}
            <details style={{ marginTop: '1rem' }}>
              <summary>Error details</summary>
              <pre style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>{this.state.error?.stack}</pre>
            </details>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
