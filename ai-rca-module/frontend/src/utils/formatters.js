/**
 * Utility functions for date and status formatting.
 */

export const formatDate = (isoString) => {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
};

export const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'connected':
    case 'healthy':
    case 'ok':
    case 'ready':
      return { text: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981' };
    case 'unconfigured':
    case 'warning':
      return { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b' };
    case 'disconnected':
    case 'failed':
    case 'error':
      return { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444' };
    default:
      return { text: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: '#6b7280' };
  }
};
