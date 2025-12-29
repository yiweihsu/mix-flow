import type { MixPatchOp } from "../mix/types";

export type Commit = {
  id: string;
  author: "user" | "ai";
  message: string;
  diff: MixPatchOp[];
  timestamp: number;
  meta?: {
    intent: "slider-adjust";
    path: string;
    from: number;
    to: number;
    targetLabel: string;
    paramLabel: string;
  };
};
