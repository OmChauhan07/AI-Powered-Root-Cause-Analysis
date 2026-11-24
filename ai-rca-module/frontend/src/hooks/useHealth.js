import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchHealthCheck } from '../features/health/healthSlice';

export const useHealth = (autoFetch = false) => {
  const dispatch = useDispatch();
  const { data, status, error, lastChecked } = useSelector((state) => state.health);

  const refetch = () => {
    dispatch(fetchHealthCheck());
  };

  useEffect(() => {
    if (autoFetch && status === 'idle') {
      dispatch(fetchHealthCheck());
    }
  }, [autoFetch, dispatch, status]);

  return {
    healthData: data,
    isLoading: status === 'loading',
    isSuccess: status === 'succeeded',
    isError: status === 'failed',
    status,
    error,
    lastChecked,
    refetch,
  };
};
