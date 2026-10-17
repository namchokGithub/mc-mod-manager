import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { DataProvider } from "./app/DataProvider";
import { ToastProvider } from "./app/ToastProvider";
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
