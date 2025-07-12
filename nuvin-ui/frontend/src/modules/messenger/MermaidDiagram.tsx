import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';

interface MermaidProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidProps) {
  const { resolvedTheme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Separate state for fullscreen mode
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const [fullscreenPanX, setFullscreenPanX] = useState(0);
  const [fullscreenPanY, setFullscreenPanY] = useState(0);
  const [fullscreenIsDragging, setFullscreenIsDragging] = useState(false);
  const [fullscreenDragStart, setFullscreenDragStart] = useState({ x: 0, y: 0 });

  const fullscreenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderMermaid = async () => {
      try {
        // Validate chart content before processing
        const trimmedChart = chart.trim();
        if (!trimmedChart) {
          setError('Empty chart content');
          return;
        }

        let cleanChart = trimmedChart;

        // Theme-aware configuration
        const isDark = resolvedTheme === 'dark';

        // Initialize Mermaid with enhanced configuration for professional styling
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          // fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 14,
          logLevel: 'fatal', // Suppress console warnings
          themeVariables: isDark ? {
            // Dark theme variables
            // Participant styling
            actorBkg: '#1e293b',
            actorBorder: '#475569',
            actorTextColor: '#f1f5f9',

            // Note styling
            noteBkgColor: '#92400e',
            noteBorderColor: '#f59e0b',
            noteTextColor: '#fef3c7',

            // Message lines
            activationBkgColor: '#1e40af',
            activationBorderColor: '#3b82f6',

            // Background
            primaryColor: '#3b82f6',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#1d4ed8',

            // Sequence diagram specific
            sequenceNumberColor: '#ffffff',
            signalColor: '#d1d5db',
            signalTextColor: '#f3f4f6',
            labelBoxBkgColor: '#374151',
            labelBoxBorderColor: '#6b7280',
            labelTextColor: '#f3f4f6',
            loopTextColor: '#f1f5f9',

            // Alt/loop box styling
            altSectionBkgColor: '#111827',

            // Grid and background
            background: '#111827',
            secondaryColor: '#374151',
            tertiaryColor: '#4b5563',
          } : {
            // Light theme variables (original)
            // Participant styling
            actorBkg: '#f8fafc',
            actorBorder: '#e2e8f0',
            actorTextColor: '#1e293b',

            // Note styling
            noteBkgColor: '#fef3c7',
            noteBorderColor: '#f59e0b',
            noteTextColor: '#92400e',

            // Message lines
            activationBkgColor: '#dbeafe',
            activationBorderColor: '#3b82f6',

            // Background
            primaryColor: '#3b82f6',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#1d4ed8',

            // Sequence diagram specific
            sequenceNumberColor: '#ffffff',
            signalColor: '#374151',
            signalTextColor: '#374151',
            labelBoxBkgColor: '#f1f5f9',
            labelBoxBorderColor: '#cbd5e1',
            labelTextColor: '#475569',
            loopTextColor: '#1e293b',

            // Alt/loop box styling
            altSectionBkgColor: '#f8fafc',

            // Grid and background
            background: '#ffffff',
            secondaryColor: '#e5e7eb',
            tertiaryColor: '#f3f4f6',
          },
          sequence: {
            useMaxWidth: true,
            boxMargin: 15,
            noteMargin: 15,
            messageMargin: 50,
            mirrorActors: true,
            showSequenceNumbers: false,
            diagramMarginX: 40,
            diagramMarginY: 20,
            actorMargin: 80,
            width: 180,
            height: 80,
            boxTextMargin: 8,
            noteAlign: 'center',
            messageAlign: 'center',
            bottomMarginAdj: 1,
            rightAngles: false,
            messageFontFamily: 'Inter, system-ui, sans-serif',
            messageFontSize: 14,
            messageFontWeight: '500',
            actorFontFamily: 'Inter, system-ui, sans-serif',
            actorFontSize: 14,
            actorFontWeight: '600',
            noteFontFamily: 'Inter, system-ui, sans-serif',
            noteFontSize: 12,
            noteFontWeight: '500'
          },
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'linear',
            padding: 20,
            nodeSpacing: 50,
            rankSpacing: 50,
            defaultRenderer: 'dagre-d3',
          },
          journey: {
            useMaxWidth: true,
          },
          gitGraph: {
            useMaxWidth: true,
          },
          c4: {
            useMaxWidth: true,
            diagramMarginX: 50,
            diagramMarginY: 30,
          },
        });

        // Generate unique ID for the diagram
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Suppress console errors during rendering (but preserve our debug logs)
        const originalError = console.error;
        const originalWarn = console.warn;

        console.error = (msg: any) => {
          if (msg && msg.toString().includes('debug:')) {
            originalError(msg);
          }
        };
        console.warn = () => {};

        try {
          // Render the diagram with cleaned chart
          const isValid = await mermaid.parse(cleanChart, { suppressErrors: true });
          console.log('Mermaid parse result:', isValid);
          if (!isValid) {
            setError('Invalid Mermaid chart syntax');
            return;
          }
          const { svg: renderedSvg } = await mermaid.render(id, cleanChart);
          setSvg(renderedSvg);
          setError('');
        } finally {
          // Restore console methods
          console.error = originalError;
          console.warn = originalWarn;
        }
      } catch (err) {
        setError('Rendering failed');
        setSvg('');
      }
    };

    if (chart.trim()) {
      renderMermaid();
    } else {
      setError('Empty chart');
    }
  }, [chart, resolvedTheme]);

  // Zoom and pan functionality
  const handleZoomIn = useCallback(() => {
    if (isFullscreen) {
      setFullscreenZoom(prev => Math.min(prev * 1.2, 3));
    } else {
      setZoom(prev => Math.min(prev * 1.2, 3));
    }
  }, [isFullscreen]);

  const handleZoomOut = useCallback(() => {
    if (isFullscreen) {
      setFullscreenZoom(prev => Math.max(prev / 1.2, 0.3));
    } else {
      setZoom(prev => Math.max(prev / 1.2, 0.3));
    }
  }, [isFullscreen]);

  const handleReset = useCallback(() => {
    if (isFullscreen) {
      setFullscreenZoom(1);
      setFullscreenPanX(0);
      setFullscreenPanY(0);
    } else {
      setZoom(1);
      setPanX(0);
      setPanY(0);
    }
  }, [isFullscreen]);

  const handleFullscreen = useCallback(() => {
    setIsFullscreen(true);
    // Reset fullscreen view when opening
    setFullscreenZoom(1);
    setFullscreenPanX(0);
    setFullscreenPanY(0);
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // Escape key to close fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleCloseFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isFullscreen, handleCloseFullscreen]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      if (isFullscreen) {
        setFullscreenIsDragging(true);
        setFullscreenDragStart({ x: e.clientX - fullscreenPanX, y: e.clientY - fullscreenPanY });
      } else {
        setIsDragging(true);
        setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
      }
    }
  }, [isFullscreen, panX, panY, fullscreenPanX, fullscreenPanY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isFullscreen && fullscreenIsDragging) {
      setFullscreenPanX(e.clientX - fullscreenDragStart.x);
      setFullscreenPanY(e.clientY - fullscreenDragStart.y);
    } else if (isDragging) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    }
  }, [isFullscreen, isDragging, fullscreenIsDragging, dragStart, fullscreenDragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setFullscreenIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    if (isFullscreen) {
      setFullscreenZoom(prev => Math.min(Math.max(prev * delta, 0.3), 3));
    } else {
      setZoom(prev => Math.min(Math.max(prev * delta, 0.3), 3));
    }
  }, [isFullscreen]);

  // Update SVG transform when zoom or pan changes
  useEffect(() => {
    if (ref.current && svg) {
      const svgElement = ref.current.querySelector('svg');
      if (svgElement) {
        svgElement.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        svgElement.style.transformOrigin = 'center center';
        svgElement.style.transition = isDragging ? 'none' : 'transform 0.1s ease-out';
      }
    }
  }, [zoom, panX, panY, svg, isDragging]);

  // Update fullscreen SVG transform
  useEffect(() => {
    if (fullscreenRef.current && svg && isFullscreen) {
      const svgElement = fullscreenRef.current.querySelector('svg');
      if (svgElement) {
        svgElement.style.transform = `translate(${fullscreenPanX}px, ${fullscreenPanY}px) scale(${fullscreenZoom})`;
        svgElement.style.transformOrigin = 'center center';
        svgElement.style.transition = fullscreenIsDragging ? 'none' : 'transform 0.1s ease-out';
      }
    }
  }, [fullscreenZoom, fullscreenPanX, fullscreenPanY, svg, fullscreenIsDragging, isFullscreen]);

  if (error) {
    return (
      <div className="relative group">
        <div className="bg-muted/30 border border-border rounded-lg p-4 overflow-x-auto">
          <div className="absolute top-2 left-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            mermaid
          </div>
          <pre className="text-sm font-mono text-foreground mt-6">
            <code>{chart}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {/* Zoom Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-background/10 backdrop-blur-sm p-2 rounded-lg border border-border/20 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-8 w-8 p-0 hover:bg-primary/10"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="h-8 w-8 p-0 hover:bg-primary/10"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 w-8 p-0 hover:bg-primary/10"
            title="Reset View"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFullscreen}
            className="h-8 w-8 p-0 hover:bg-primary/10"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <div className="text-xs text-muted-foreground text-center px-1 py-1 bg-muted/20 rounded">
            {Math.round(zoom * 100)}%
          </div>
        </div>

      {/* Diagram Container */}
      <div
        ref={ref}
        className="mermaid-diagram overflow-hidden border border-border/20 bg-background p-6 rounded-xl shadow-sm select-none"
        style={{
          minHeight: '500px',
          background: resolvedTheme === 'dark'
            ? 'linear-gradient(to bottom, #111827 0%, #1f2937 100%)'
            : 'linear-gradient(to bottom, #ffffff 0%, #fafbfc 100%)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

        {/* Instructions */}
        <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-border/20 shadow-sm">
          <div className="flex items-center gap-4">
            <span>🖱️ Drag to pan</span>
            <span>🔍 Scroll to zoom</span>
            <span>📐 {Math.round(zoom * 100)}% zoom</span>
          </div>
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className={`fixed inset-0 z-50 backdrop-blur-sm ${
          resolvedTheme === 'dark' ? 'bg-gray-900/95' : 'bg-white/95'
        }`}>
          <div className={`relative w-full h-full ${
            resolvedTheme === 'dark'
              ? 'bg-gradient-to-br from-gray-900 to-gray-800'
              : 'bg-gradient-to-br from-gray-50 to-gray-100'
          }`}>
            {/* Fullscreen Controls */}
            <div className="absolute top-6 right-6 z-10 flex flex-col gap-2 bg-background/90 backdrop-blur-sm p-2 rounded-lg border border-border/20 shadow-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                className="h-8 w-8 p-0 hover:bg-primary/10"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                className="h-8 w-8 p-0 hover:bg-primary/10"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 w-8 p-0 hover:bg-primary/10"
                title="Reset View"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseFullscreen}
                className="h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-600"
                title="Exit Fullscreen"
              >
                <X className="h-4 w-4" />
              </Button>
              <div className="text-xs text-muted-foreground text-center px-1 py-1 bg-muted/20 rounded">
                {Math.round(fullscreenZoom * 100)}%
              </div>
            </div>

            {/* Fullscreen Diagram Container */}
            <div
              ref={fullscreenRef}
              className="w-full h-full overflow-hidden flex items-center justify-center select-none bg-background/80 rounded-lg m-6"
              style={{
                cursor: fullscreenIsDragging ? 'grabbing' : 'grab',
                background: resolvedTheme === 'dark'
                  ? 'linear-gradient(to bottom, #111827 0%, #1f2937 100%)'
                  : 'linear-gradient(to bottom, #ffffff 0%, #fafbfc 100%)',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            {/* Fullscreen Instructions */}
            <div className="absolute bottom-6 left-6 text-sm text-foreground bg-background/90 backdrop-blur-sm px-4 py-3 rounded-lg border border-border/20 shadow-sm">
              <div className="flex items-center gap-6">
                <span>🖱️ Drag to pan</span>
                <span>🔍 Scroll to zoom</span>
                <span>⌨️ ESC to exit</span>
                <span>📐 {Math.round(fullscreenZoom * 100)}% zoom</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
