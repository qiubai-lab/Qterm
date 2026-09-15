import React from "react";
import ReactDOM from "react-dom/client";
import DemoApp from "./DemoApp";

document.documentElement.dataset.theme = "dark";
document.documentElement.dataset.demo = "true";
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><DemoApp/></React.StrictMode>);
