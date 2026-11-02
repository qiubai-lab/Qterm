import { createGitObservationTransport } from "../gitObservationTransport";
export const supportsGitObservation = true;
const observations = createGitObservationTransport();
export const subscribeGitObservation = observations.subscribe;
