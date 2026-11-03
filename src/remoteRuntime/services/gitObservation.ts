// Each page has one immutable runtime; native device services stay outside this router.
import * as local from "../../lib/tauri/gitObservation";
import * as remote from "../../server/services/gitObservation";
import { selectedRuntime } from "../selection";
export type * from "../../lib/tauri/gitObservation";
export const subscribeGitObservation: typeof local.subscribeGitObservation = (...args) => (selectedRuntime ? remote.subscribeGitObservation : local.subscribeGitObservation)(...args);
export const supportsGitObservation: boolean = selectedRuntime ? remote.supportsGitObservation : local.supportsGitObservation;
