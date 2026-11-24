import { configureStore } from '@reduxjs/toolkit';
import healthReducer from '../features/health/healthSlice';
import investigationReducer from '../features/investigation/investigationSlice';

export const store = configureStore({
  reducer: {
    health: healthReducer,
    investigation: investigationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
