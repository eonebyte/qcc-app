// src/redux/locationSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    coordinates: null, // Menyimpan format { latitude, longitude }
    error: null,
};

export const locationSlice = createSlice({
    name: 'location',
    initialState,
    reducers: {
        // Action untuk berhasil mendapatkan lokasi
        setLocation: (state, action) => {
            state.coordinates = action.payload;
            state.error = null;
        },
        // Action jika gagal atau me-reset lokasi
        clearLocation: (state) => {
            state.coordinates = null;
        },
        // Action untuk menyimpan pesan error
        setLocationError: (state, action) => {
            state.coordinates = null;
            state.error = action.payload;
        },
    },
});

// Ekspor actions agar bisa digunakan di komponen lain
export const { setLocation, clearLocation, setLocationError } = locationSlice.actions;

// Ekspor reducer untuk digabungkan di store
export default locationSlice.reducer;