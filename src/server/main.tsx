import React from "react";
import ReactDOM from "react-dom/client";
import { ServerApp } from "./ServerApp";
document.documentElement.dataset.theme = "dark";
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><ServerApp/></React.StrictMode>);
