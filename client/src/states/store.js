import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./reducers/authSlice";
import themeReducer from './reducers/themeSlice';
import locationReducer from "./reducers/locationSlice";
// import tabReducer from './reducers/tabSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        theme: themeReducer,
        location: locationReducer
        // tabs: tabReducer,
    },
}, window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__())