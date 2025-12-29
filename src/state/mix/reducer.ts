import type { MixPatchOp, MixState } from "./types";

const parsePath = (path: string): Array<string | number> => {
  if (path === "" || path === "/") {
    return [];
  }

  return path
    .replace(/^\//, "")
    .split("/")
    .map((segment) => {
      const decoded = decodeURIComponent(segment);
      const asNumber = Number(decoded);
      return Number.isNaN(asNumber) ? decoded : asNumber;
    });
};

const cloneMixState = (state: MixState): MixState => {
  return {
    params: { ...state.params },
  };
};

const setValueAtPath = (target: unknown, path: Array<string | number>, value: unknown) => {
  if (path.length === 0) {
    return value;
  }

  let cursor = target as Record<string, unknown> | unknown[];
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (typeof key === "number" && Array.isArray(cursor)) {
      cursor = cursor[key] as Record<string, unknown> | unknown[];
    } else if (typeof key === "string" && typeof cursor === "object" && cursor !== null) {
      cursor = (cursor as Record<string, unknown>)[key] as Record<string, unknown> | unknown[];
    }
  }

  const lastKey = path[path.length - 1];
  if (typeof lastKey === "number" && Array.isArray(cursor)) {
    cursor[lastKey] = value;
  } else if (typeof lastKey === "string" && typeof cursor === "object" && cursor !== null) {
    (cursor as Record<string, unknown>)[lastKey] = value;
  }

  return target;
};

const removeValueAtPath = (target: unknown, path: Array<string | number>) => {
  if (path.length === 0) {
    return target;
  }

  let cursor = target as Record<string, unknown> | unknown[];
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (typeof key === "number" && Array.isArray(cursor)) {
      cursor = cursor[key] as Record<string, unknown> | unknown[];
    } else if (typeof key === "string" && typeof cursor === "object" && cursor !== null) {
      cursor = (cursor as Record<string, unknown>)[key] as Record<string, unknown> | unknown[];
    }
  }

  const lastKey = path[path.length - 1];
  if (typeof lastKey === "number" && Array.isArray(cursor)) {
    cursor.splice(lastKey, 1);
  } else if (typeof lastKey === "string" && typeof cursor === "object" && cursor !== null) {
    delete (cursor as Record<string, unknown>)[lastKey];
  }

  return target;
};

export const applyPatch = (mixState: MixState, patch: MixPatchOp[]): MixState => {
  let nextState = cloneMixState(mixState);

  for (const operation of patch) {
    const path = parsePath(operation.path);

    if (operation.op === "remove") {
      nextState = removeValueAtPath(nextState, path) as MixState;
      continue;
    }

    nextState = setValueAtPath(nextState, path, operation.value) as MixState;
  }

  return nextState;
};
