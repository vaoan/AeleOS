import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its own cleanup when Vitest runs with
// `globals: true`, which this project does not. Without this, each render
// leaves its DOM behind and the *second* component test in a file starts
// finding duplicate elements from the first.
afterEach(cleanup);
