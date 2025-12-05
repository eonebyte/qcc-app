// store/customerSlice.js
import { createSlice } from "@reduxjs/toolkit";

const customerSlice = createSlice({
    name: "customers",
    initialState: {
        list: []
    },
    reducers: {
        setCustomers: (state, action) => {
            state.list = action.payload;
        }
    }
});

export const { setCustomers } = customerSlice.actions;
export default customerSlice.reducer;
