import React, { useState } from 'react';
import CopilotWorkspace from './pages/CopilotWorkspace';
import WorkspaceLayout from './layouts/WorkspaceLayout';

export const App = () => {
  const [viewMode, setViewMode] = useState('copilot');

  if (viewMode === 'copilot') {
    return <CopilotWorkspace onSwitchToStepper={() => setViewMode('stepper')} />;
  }

  return <WorkspaceLayout onSwitchToCopilot={() => setViewMode('copilot')} />;
};

export default App;
