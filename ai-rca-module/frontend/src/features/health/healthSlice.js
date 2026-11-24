import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getHealthStatus } from '../../services/api';

export const fetchHealthCheck = createAsyncThunk(
  'health/fetchHealthCheck',
  async (_, { rejectWithValue }) => {
    try {
      const data = await getHealthStatus();
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to connect to backend service');
    }
  }
);

const initialState = {
  data: null,
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
  lastChecked: null,
};

export const healthSlice = createSlice({
  name: 'health',
  initialState,
  reducers: {
    resetHealthStatus: (state) => {
      state.data = null;
      state.status = 'idle';
      state.error = null;
      state.lastChecked = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHealthCheck.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchHealthCheck.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
        state.error = null;
        state.lastChecked = new Date().toISOString();
      })
      .addCase(fetchHealthCheck.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
        state.lastChecked = new Date().toISOString();
      });
  },
});

export const { resetHealthStatus } = healthSlice.actions;
export default healthSlice.reducer;
