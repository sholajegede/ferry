/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as devices from "../devices.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as pairs from "../pairs.js";
import type * as rooms from "../rooms.js";
import type * as signals from "../signals.js";
import type * as stats from "../stats.js";
import type * as turn from "../turn.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  devices: typeof devices;
  http: typeof http;
  lib: typeof lib;
  maintenance: typeof maintenance;
  pairs: typeof pairs;
  rooms: typeof rooms;
  signals: typeof signals;
  stats: typeof stats;
  turn: typeof turn;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
