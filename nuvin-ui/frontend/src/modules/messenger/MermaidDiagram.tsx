import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';

interface MermaidProps {
  chart: string;
}

interface FullscreenDiagramProps {
  svg: string;
  resolvedTheme: string;
  onClose: () => void;
}

function FullscreenDiagram({
  svg,
  resolvedTheme,
  onClose,
}: FullscreenDiagramProps) {
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const [fullscreenPanX, setFullscreenPanX] = useState(0);
  const [fullscreenPanY, setFullscreenPanY] = useState(0);
  const [fullscreenIsDragging, setFullscreenIsDragging] = useState(false);
  const [fullscreenDragStart, setFullscreenDragStart] = useState({
    x: 0,
    y: 0,
  });

  // Zoom and pan functionality for fullscreen
  const handleZoomIn = useCallback(() => {
    setFullscreenZoom((prev) => Math.min(prev * 1.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFullscreenZoom((prev) => Math.max(prev / 1.2, 0.3));
  }, []);

  const handleReset = useCallback(() => {
    setFullscreenZoom(1);
    setFullscreenPanX(0);
    setFullscreenPanY(0);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        setFullscreenIsDragging(true);
        setFullscreenDragStart({
          x: e.clientX - fullscreenPanX,
          y: e.clientY - fullscreenPanY,
        });
      }
    },
    [fullscreenPanX, fullscreenPanY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (fullscreenIsDragging) {
        setFullscreenPanX(e.clientX - fullscreenDragStart.x);
        setFullscreenPanY(e.clientY - fullscreenDragStart.y);
      }
    },
    [fullscreenIsDragging, fullscreenDragStart],
  );

  const handleMouseUp = useCallback(() => {
    setFullscreenIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setFullscreenZoom((prev) => Math.min(Math.max(prev * delta, 0.3), 3));
  }, []);

  // Escape key to close fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  // Update fullscreen SVG transform
  useEffect(() => {
    if (fullscreenRef.current && svg) {
      const svgElement = fullscreenRef.current.querySelector('svg');
      if (svgElement) {
        svgElement.style.transform = `translate(${fullscreenPanX}px, ${fullscreenPanY}px) scale(${fullscreenZoom})`;
        svgElement.style.transformOrigin = 'center center';
        svgElement.style.transition = fullscreenIsDragging
          ? 'none'
          : 'transform 0.1s ease-out';
      }
    }
  }, [
    fullscreenZoom,
    fullscreenPanX,
    fullscreenPanY,
    svg,
    fullscreenIsDragging,
  ]);

  return (
    <div
      className={`fixed inset-0 z-50 backdrop-blur-sm ${
        resolvedTheme === 'dark' ? 'bg-gray-900/95' : 'bg-white/95'
      } flex items-center justify-center`}
    >
      <div
        className={`relative w-[90%] h-[90%] ${
          resolvedTheme === 'dark'
            ? 'bg-gradient-to-br from-gray-900 to-gray-800'
            : 'bg-gradient-to-br from-gray-50 to-gray-100'
        } rounded-xl shadow-2xl border border-border/20`}
      >
        {/* Fullscreen Controls */}
        <div className="absolute top-6 right-6 z-10 flex flex-col gap-2 bg-background/60 backdrop-blur-sm p-2 rounded-lg border border-border/20 shadow-sm">
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
            onClick={onClose}
            className="h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-600"
            title="Exit Fullscreen"
          >
            <X className="h-4 w-4" />
          </Button>
          {/* <div className="text-xs text-muted-foreground text-center px-1 py-1 bg-muted/20 rounded">
            {Math.round(fullscreenZoom * 100)}%
          </div> */}
        </div>

        {/* Fullscreen Diagram Container */}
        <div
          ref={fullscreenRef}
          className="w-full h-full overflow-hidden flex items-center justify-center select-none bg-background/90 rounded-lg border border-border/20"
          style={{
            cursor: fullscreenIsDragging ? 'grabbing' : 'grab',
            background:
              resolvedTheme === 'dark'
                ? 'linear-gradient(to bottom, #1a202c 0%, #2d3748 100%)'
                : 'linear-gradient(to bottom, #ffffff 0%, #f7fafc 100%)',
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
  );
}

export function MermaidDiagram({ chart }: MermaidProps) {
  const { resolvedTheme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        
        // Convert newer flowchart syntax to older graph syntax for better compatibility
        if (cleanChart.startsWith('flowchart ')) {
          cleanChart = cleanChart.replace(/^flowchart\s+/, 'graph ');
        }

        // Theme-aware configuration
        const isDark = resolvedTheme === 'dark';

        // Initialize Mermaid with enhanced configuration for better readability
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 16,
          logLevel: 'fatal', // Suppress console warnings
          // Explicitly enable diagram types
          deterministicIds: true,
          themeVariables: isDark
            ? {
                // Dark theme variables - Enhanced for better readability
                // Participant styling
                actorBkg: '#2d3748',
                actorBorder: '#4a5568',
                actorTextColor: '#f7fafc',

                // Note styling
                noteBkgColor: '#2b6cb0',
                noteBorderColor: '#3182ce',
                noteTextColor: '#f7fafc',

                // Message lines
                activationBkgColor: '#2b6cb0',
                activationBorderColor: '#3182ce',

                // Background
                primaryColor: '#3182ce',
                primaryTextColor: '#f7fafc',
                primaryBorderColor: '#2b6cb0',

                // Sequence diagram specific
                sequenceNumberColor: '#f7fafc',
                signalColor: '#e2e8f0',
                signalTextColor: '#f7fafc',
                labelBoxBkgColor: '#4a5568',
                labelBoxBorderColor: '#718096',
                labelTextColor: '#f7fafc',
                loopTextColor: '#f7fafc',

                // Alt/loop box styling
                altSectionBkgColor: '#2d3748',

                // Grid and background
                background: '#1a202c',
                secondaryColor: '#4a5568',
                tertiaryColor: '#718096',
              }
            : {
                // Light theme variables - Enhanced for better readability
                // Participant styling
                actorBkg: '#ffffff',
                actorBorder: '#e2e8f0',
                actorTextColor: '#1a202c',

                // Note styling
                noteBkgColor: '#bee3f8',
                noteBorderColor: '#3182ce',
                noteTextColor: '#1a365d',

                // Message lines
                activationBkgColor: '#bee3f8',
                activationBorderColor: '#3182ce',

                // Background
                primaryColor: '#3182ce',
                primaryTextColor: '#1a202c',
                primaryBorderColor: '#2b6cb0',

                // Sequence diagram specific
                sequenceNumberColor: '#1a202c',
                signalColor: '#4a5568',
                signalTextColor: '#1a202c',
                labelBoxBkgColor: '#f7fafc',
                labelBoxBorderColor: '#e2e8f0',
                labelTextColor: '#1a202c',
                loopTextColor: '#1a202c',

                // Alt/loop box styling
                altSectionBkgColor: '#f7fafc',

                // Grid and background
                background: '#ffffff',
                secondaryColor: '#f7fafc',
                tertiaryColor: '#edf2f7',
              },
          sequence: {
            useMaxWidth: true,
            boxMargin: 20,
            noteMargin: 20,
            messageMargin: 60,
            mirrorActors: true,
            showSequenceNumbers: false,
            diagramMarginX: 50,
            diagramMarginY: 30,
            actorMargin: 100,
            width: 200,
            height: 90,
            boxTextMargin: 12,
            noteAlign: 'center',
            messageAlign: 'center',
            bottomMarginAdj: 1,
            rightAngles: false,
            messageFontFamily: 'Inter, system-ui, sans-serif',
            messageFontSize: 16,
            messageFontWeight: '500',
            actorFontFamily: 'Inter, system-ui, sans-serif',
            actorFontSize: 16,
            actorFontWeight: '600',
            noteFontFamily: 'Inter, system-ui, sans-serif',
            noteFontSize: 14,
            noteFontWeight: '500',
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
          const { svg: renderedSvg } = await mermaid.render(id, cleanChart);
          setSvg(renderedSvg);
          setError('');
        } catch (err) {
          console.error('Mermaid rendering error:', err);
          setError('Rendering failed');
        } finally {
          // Restore console methods
          console.error = originalError;
          console.warn = originalWarn;
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
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

  const handleFullscreen = useCallback(() => {
    setIsFullscreen(true);
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  if (error) {
    return (
      <div className="relative group">
        <div className="bg-muted/30 border border-border rounded-lg p-4 overflow-x-auto mb-3">
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
        {/* Controls - Only show fullscreen button in normal mode */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-background/10 backdrop-blur-sm p-0 rounded-lg border border-border/20 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFullscreen}
            className="h-8 w-8 hover:bg-primary/10"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4 m-2" />
          </Button>
        </div>

        {/* Diagram Container */}
        <div
          ref={ref}
          className="mermaid-diagram overflow-hidden border border-border/30 bg-background p-8 rounded-xl shadow-sm select-none mb-4"
          style={{
            minHeight: '250px',
            background:
              resolvedTheme === 'dark'
                ? 'linear-gradient(to bottom, #1a202c 0%, #2d3748 100%)'
                : 'linear-gradient(to bottom, #ffffff 0%, #f7fafc 100%)',
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Fullscreen Modal using Portal */}
      {isFullscreen &&
        createPortal(
          <FullscreenDiagram
            svg={svg}
            resolvedTheme={resolvedTheme}
            onClose={handleCloseFullscreen}
          />,
          document.body,
        )}
    </>
  );
}
