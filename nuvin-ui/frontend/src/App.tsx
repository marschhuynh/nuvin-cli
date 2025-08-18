import { Navbar } from '@/components';
import { useState, useEffect } from 'react';
import { BrowserRouter } from 'react-router';
import { ThemeProvider } from '@/lib/theme';
import { initializeTools, initializeMCPTools } from '@/lib/tools';
import { ToolPermissionDialog } from '@/modules/tool/ToolPermissionDialog';
import AppRoutes from './routes';

function App() {
  const [user] = useState({ name: 'Marsch Huynh' });

  // Initialize tools on app startup
  useEffect(() => {
    initializeTools();

    // Initialize MCP tools asynchronously
    initializeMCPTools().catch(console.error);
  }, []);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="h-screen flex flex-col bg-background">
          <Navbar userName={user.name} />
          <AppRoutes />
          <ToolPermissionDialog />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
