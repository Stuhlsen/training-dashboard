import dataset from "../assets/demo/dataset.json";
import type { DemoDataset } from "./types";

export function loadDemoDataset(): DemoDataset {
  return dataset as unknown as DemoDataset;
}
