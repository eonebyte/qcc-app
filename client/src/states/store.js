import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./reducers/authSlice";
import themeReducer from './reducers/themeSlice';
import customerReducer from './reducers/customerSlice'
import locationReducer from "./reducers/locationSlice";
// import tabReducer from './reducers/tabSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        theme: themeReducer,
        location: locationReducer,
        customers: customerReducer
        // tabs: tabReducer,
    },
}, window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__())