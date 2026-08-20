import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import "./app.css";

export default function App() {
  return <WorkspaceProvider><WorkspaceShell/></WorkspaceProvider>;
}
