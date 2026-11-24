import React from 'react';
import { useSelector } from 'react-redux';
import Navbar from './Navbar';
import StageNav from '../components/StageNav';
import IntakeStage from '../pages/stages/IntakeStage';
import FormStage from '../pages/stages/FormStage';
import EvidenceStage from '../pages/stages/EvidenceStage';
import RcaMethodsStage from '../pages/stages/RcaMethodsStage';
import CapaStage from '../pages/stages/CapaStage';
import SummaryStage from '../pages/stages/SummaryStage';
import HealthCard from '../components/HealthCard';
import { useHealth } from '../hooks/useHealth';

export const WorkspaceLayout = ({ onSwitchToCopilot }) => {
  const activeStage = useSelector((state) => state.investigation.activeStage);
  const { healthData, isLoading, isError, error, refetch, lastChecked } = useHealth(true);

  const renderActiveStage = () => {
    switch (activeStage) {
      case 'intake':
        return <IntakeStage />;
      case 'form':
        return <FormStage />;
      case 'evidence':
        return <EvidenceStage />;
      case 'rca_methods':
        return <RcaMethodsStage />;
      case 'capa':
        return <CapaStage />;
      case 'summary':
        return <SummaryStage />;
      default:
        return <IntakeStage />;
    }
  };

  return (
    <div style={layoutStyles.container}>
      <Navbar onSwitchToCopilot={onSwitchToCopilot} />
      <StageNav />

      <main style={layoutStyles.mainContent}>
        {renderActiveStage()}

        {/* Collapsible System Health Footer Bar */}
        <div style={layoutStyles.healthSection}>
          <HealthCard
            healthData={healthData}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRefresh={refetch}
            lastChecked={lastChecked}
          />
        </div>
      </main>
    </div>
  );
};

const layoutStyles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0b1120',
    color: '#f8fafc',
  },
  mainContent: {
    maxWidth: '1240px',
    margin: '0 auto',
    padding: '0 24px 32px 24px',
  },
  healthSection: {
    marginTop: '32px',
  },
};

export default WorkspaceLayout;
