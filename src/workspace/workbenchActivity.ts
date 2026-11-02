import { createContext, useContext } from "react";

/** Desktop defaults to active; Web suspends background readers while locked. */
export const WorkbenchActivity = createContext(true);
export const useWorkbenchActive = () => useContext(WorkbenchActivity);
