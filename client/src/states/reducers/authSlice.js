import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

// checkAuthStatus (cek status auth saat awal)
export const checkAuthStatus = createAsyncThunk(
  "auth/checkAuthStatus",
  async (_, { rejectWithValue }) => {
    try {
      const res = await axios.get(`${backEndUrl}/auth/cas`, {
        withCredentials: true,
      });
      return res.data;
    } catch (error) {
      if (error.response?.status === 401) {
        return rejectWithValue("Unauthorized. Please login.");
      }
      return rejectWithValue(error.response?.data || "Server error");
    }
  },
);

// login
// PERBAIKAN: Parameter diubah menjadi 'credentials' agar bisa menerima (username, password) ATAU (pin, isPinLogin)
export const login = createAsyncThunk(
  "auth/login",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${backEndUrl}/auth/login`,
        credentials,
        { withCredentials: true },
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || "Login failed");
    }
  },
);

// logout
export const logout = createAsyncThunk(
  "auth/logout",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${backEndUrl}/auth/logout`, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || "Logout failed");
    }
  },
);

// authSlice
const authSlice = createSlice({
  name: "auth",
  initialState: {
    auth: false,
    user: null,
    isLoading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      // --- LOGIN ACTIONS ---
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        // LOGIC PENTING: Cegah Redirect jika butuh Setup PIN
        if (action.payload.requirePinSetup) {
          state.auth = false; // Tetap false agar tidak redirect di App.js
          state.user = null; // Jangan simpan user dulu
        } else {
          // Login Normal (Sudah punya PIN atau User Lama)
          state.auth = true;
          state.user = action.payload.user;
        }
        state.isLoading = false;
      })
      .addCase(login.rejected, (state, action) => {
        state.error = action.payload;
        state.isLoading = false;
      })

      // --- CHECK AUTH STATUS ACTIONS ---
      .addCase(checkAuthStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(checkAuthStatus.fulfilled, (state, action) => {
        state.auth = true;
        state.user = action.payload.user;
        state.isLoading = false;
      })
      .addCase(checkAuthStatus.rejected, (state, action) => {
        state.auth = false;
        state.user = null;
        state.error = action.payload;
        state.isLoading = false;
      })

      // --- LOGOUT ACTIONS ---
      .addCase(logout.fulfilled, (state) => {
        state.auth = false;
        state.user = null;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(logout.rejected, (state, action) => {
        state.error = action.payload;
        state.isLoading = false;
      });
  },
});

export default authSlice.reducer;
