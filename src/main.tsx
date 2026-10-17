import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { DataProvider } from "./app/DataProvider";
import { ToastProvider } from "./app/ToastProvider";
// Self-hosted WOFF2 fonts with font-display: swap, split into unicode-range subsets.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/noto-sans-thai/wght.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DataProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </DataProvider>
  </React.StrictMode>,
);
