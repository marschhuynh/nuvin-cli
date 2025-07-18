export function LoadingMessage() {
  return (
    <div className="flex justify-start animate-in fade-in slide-in-from-left-3 duration-300">
      <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent animate-pulse duration-1000" />
        <div className="h-4 w-4 bg-primary-foreground rounded-full animate-pulse relative z-10" />
      </div>
      <div className="max-w-[70%] p-4 rounded-lg bg-card ml-4 shadow-md border border-border/50 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/10 to-transparent -translate-x-full animate-pulse duration-2000" />
        <div className="flex space-x-1.5 items-center relative z-10">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-bounce shadow-sm" />
            <div
              className="w-2 h-2 bg-gradient-to-r from-purple-400 to-purple-600 rounded-full animate-bounce shadow-sm"
              style={{ animationDelay: '0.15s' }}
            />
            <div
              className="w-2 h-2 bg-gradient-to-r from-green-400 to-green-600 rounded-full animate-bounce shadow-sm"
              style={{ animationDelay: '0.3s' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}