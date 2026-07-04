/**
 * Thin helpers over the machine-generated {@link paths} types.
 *
 * `src/generated/openapi.ts` is produced from Luma's published OpenAPI
 * (`bun run generate`) and is the single source of truth for every endpoint's
 * parameters and response shapes. These aliases pluck the useful pieces out of
 * that deeply-nested structure so the rest of the SDK — and consumers — can
 * name request/response types without hand-writing them.
 */
export type { components, operations, paths, webhooks } from "./generated/openapi";

import type { paths } from "./generated/openapi";

type Operation<P extends keyof paths, M extends keyof paths[P]> = paths[P][M];

/** JSON body of an endpoint's success (200/201) response. */
export type ResponseOf<P extends keyof paths, M extends keyof paths[P]> =
	Operation<P, M> extends { responses: infer R }
		? R extends { 200: { content: { "application/json": infer J } } }
			? J
			: R extends { 201: { content: { "application/json": infer J } } }
				? J
				: never
		: never;

/** Query parameters an endpoint accepts. */
export type QueryOf<P extends keyof paths, M extends keyof paths[P]> =
	Operation<P, M> extends { parameters: { query?: infer Q } } ? Q : never;

/** JSON request body an endpoint accepts. */
export type BodyOf<P extends keyof paths, M extends keyof paths[P]> =
	Operation<P, M> extends {
		requestBody?: { content: { "application/json": infer B } };
	}
		? B
		: never;
