import React from 'react';
import Navbar from './layouts/Navbar';
import Dashboard from './pages/Dashboard';

export const App = () => {
  return (
    <div className="app-container" style={{ minHeight: '100vh', backgroundColor: '#0b1120' }}>
      <Navbar />
      <main>
        <Dashboard />
      </main>
    </div>
  );
};

export default App;
