import { LUMA_API_BASE_URL, LUMA_API_KEY_HEADER } from "./constants";
import { LumaApiError } from "./errors";
import type {
	CreateCalendarCouponInput,
	GetEventGuestOptions,
	ListCalendarEventsOptions,
	ListCalendarPeopleOptions,
	ListEventGuestsOptions,
	LumaCalendarEntry,
	LumaCoupon,
	LumaCouponEntry,
	LumaEvent,
	LumaGuest,
	LumaGuestEntry,
	LumaPaginatedResponse,
	LumaPerson,
	UpdateGuestStatusOptions,
} from "./types";

export interface LumaClientOptions {
	/** Luma API key. Found under Calendar Settings → API on a Luma Plus plan. */
	apiKey: string;
	/** Override the API base URL. Defaults to {@link LUMA_API_BASE_URL}. */
	baseUrl?: string;
	/**
	 * Fetch implementation to use. Defaults to the global `fetch`. Pass a
	 * custom one to inject Next.js cache hints, retries, or a test double.
	 */
	fetch?: typeof fetch;
}

/** Per-request options for {@link LumaClient.request}. */
export interface LumaRequestInit {
	method?: string;
	/** Query parameters. `undefined`/`null` values are dropped; `Date`s are
	 * serialised as ISO strings. */
	query?: Record<string, unknown>;
	/** JSON request body. Sets `content-type: application/json`. */
	body?: unknown;
	signal?: AbortSignal;
	/** Extra `fetch` init merged last — e.g. Next.js `{ next: { revalidate } }`. */
	fetchInit?: RequestInit;
}

const serializeQueryValue = (value: unknown): string =>
	value instanceof Date ? value.toISOString() : String(value);

const toIso = (value: Date | string): string =>
	value instanceof Date ? value.toISOString() : value;

/** Drain an async generator into an array. */
export const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
	const out: T[] = [];
	for await (const item of source) {
		out.push(item);
	}
	return out;
};

/**
 * Typed client for the Luma (lu.ma) public API.
 *
 * The typed resource methods cover the endpoints this client is built around;
 * for anything not modelled here, {@link LumaClient.request} and
 * {@link LumaClient.paginate} are public escape hatches that work against any
 * endpoint.
 */
export class LumaClient {
	readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: LumaClientOptions) {
		if (!options.apiKey) {
			throw new Error("LumaClient requires an `apiKey`");
		}
		this.apiKey = options.apiKey;
		this.baseUrl = options.baseUrl ?? LUMA_API_BASE_URL;
		const fetchImpl = options.fetch ?? globalThis.fetch;
		if (typeof fetchImpl !== "function") {
			throw new Error(
				"No global `fetch` available; pass one via LumaClientOptions.fetch",
			);
		}
		this.fetchImpl = fetchImpl;
	}

	/**
	 * Construct a client from environment variables. Reads `LUMA_API_KEY` and,
	 * optionally, `LUMA_API_BASE_URL`.
	 */
	static fromEnv(
		env: Record<string, string | undefined> = typeof process !== "undefined"
			? process.env
			: {},
	): LumaClient {
		const apiKey = env.LUMA_API_KEY;
		if (!apiKey) {
			throw new Error("LUMA_API_KEY is not set");
		}
		return new LumaClient({ apiKey, baseUrl: env.LUMA_API_BASE_URL });
	}

	/**
	 * Low-level request against any Luma endpoint. `path` is taken relative to
	 * the base URL, e.g. `/v1/event/get`.
	 */
	async request<T>(path: string, init: LumaRequestInit = {}): Promise<T> {
		const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
		if (init.query) {
			for (const [key, value] of Object.entries(init.query)) {
				if (value !== undefined && value !== null) {
					url.searchParams.set(key, serializeQueryValue(value));
				}
			}
		}

		const headers: Record<string, string> = {
			[LUMA_API_KEY_HEADER]: this.apiKey,
			accept: "application/json",
		};
		let body: string | undefined;
		if (init.body !== undefined) {
			headers["content-type"] = "application/json";
			body = JSON.stringify(init.body);
		}

		let response: Response;
		try {
			response = await this.fetchImpl(url, {
				method: init.method ?? "GET",
				headers,
				body,
				signal: init.signal,
				...init.fetchInit,
			});
		} catch (cause) {
			throw new LumaApiError({
				message: `Luma API request to ${path} failed: ${
					cause instanceof Error ? cause.message : String(cause)
				}`,
				status: 0,
				body: "",
				path,
			});
		}

		const text = await response.text();
		if (!response.ok) {
			throw new LumaApiError({
				message: `Luma API responded ${response.status} for ${path}`,
				status: response.status,
				body: text,
				path,
			});
		}
		if (text.length === 0) {
			return undefined as T;
		}
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new LumaApiError({
				message: `Luma API returned a non-JSON body for ${path}`,
				status: response.status,
				body: text,
				path,
			});
		}
	}

	/**
	 * Iterate a cursor-paginated endpoint, yielding each entry. Follows
	 * `next_cursor` while `has_more` is true.
	 */
	async *paginate<T>(
		path: string,
		query: Record<string, unknown> = {},
	): AsyncGenerator<T> {
		let cursor: string | null | undefined;
		// Hard stop so a misbehaving endpoint cannot loop forever.
		for (let page = 0; page < 10_000; page += 1) {
			const pageQuery = { ...query };
			if (cursor) {
				pageQuery.pagination_cursor = cursor;
			}
			const result = await this.request<LumaPaginatedResponse<T>>(path, {
				query: pageQuery,
			});
			for (const entry of result.entries ?? []) {
				yield entry;
			}
			if (!result.has_more || !result.next_cursor) {
				return;
			}
			cursor = result.next_cursor;
		}
	}

	// ─── calendar ────────────────────────────────────────────────────────

	readonly calendar = {
		/** Iterate every event on a calendar. */
		listEvents: (options: ListCalendarEventsOptions) =>
			this.paginate<LumaCalendarEntry>("/v1/calendar/list-events", {
				calendar_api_id: options.calendarApiId,
				after: options.after,
				before: options.before,
				pagination_limit: options.paginationLimit,
				pagination_cursor: options.paginationCursor,
			}),

		/** Collect every event on a calendar into an array. */
		listAllEvents: (options: ListCalendarEventsOptions) =>
			collect(this.calendar.listEvents(options)),

		/** Iterate every person who has interacted with a calendar. */
		listPeople: (options: ListCalendarPeopleOptions) =>
			this.paginate<LumaPerson>("/v1/calendar/list-people", {
				calendar_api_id: options.calendarApiId,
				pagination_limit: options.paginationLimit,
				pagination_cursor: options.paginationCursor,
			}),

		/** Collect every person on a calendar into an array. */
		listAllPeople: (options: ListCalendarPeopleOptions) =>
			collect(this.calendar.listPeople(options)),

		/** Iterate every coupon on the calendar tied to the API key. */
		listCoupons: async function* (this: LumaClient): AsyncGenerator<LumaCoupon> {
			for await (const entry of this.paginate<LumaCouponEntry>(
				"/v1/calendar/coupons",
			)) {
				yield normalizeCoupon(entry);
			}
		}.bind(this),

		/** Find a calendar coupon by its code, or `null` if none matches. */
		findCouponByCode: async (code: string): Promise<LumaCoupon | null> => {
			const target = code.toLowerCase();
			for await (const coupon of this.calendar.listCoupons()) {
				if (coupon.code.toLowerCase() === target) {
					return coupon;
				}
			}
			return null;
		},

		/** Create a calendar coupon. */
		createCoupon: async (input: CreateCalendarCouponInput): Promise<LumaCoupon> => {
			const discount =
				input.discount.type === "percent"
					? {
							discount_type: "percent" as const,
							percent_off: input.discount.percentOff,
						}
					: {
							discount_type: "amount" as const,
							cents_off: input.discount.centsOff,
							currency: input.discount.currency.toLowerCase(),
						};
			const response = await this.request<{ coupon?: LumaCouponEntry }>(
				"/v1/calendar/coupons/create",
				{
					method: "POST",
					body: {
						code: input.code,
						remaining_count: input.remainingCount,
						valid_start_at: input.validStartAt
							? toIso(input.validStartAt)
							: undefined,
						valid_end_at: input.validEndAt
							? toIso(input.validEndAt)
							: undefined,
						discount,
					},
				},
			);
			return normalizeCoupon(response.coupon ?? {}, input.code);
		},
	};

	// ─── events ──────────────────────────────────────────────────────────

	readonly events = {
		/** Fetch a single event by its `api_id`. */
		get: async (eventApiId: string): Promise<LumaEvent> => {
			const response = await this.request<{ event?: LumaEvent } & LumaEvent>(
				"/v1/event/get",
				{ query: { api_id: eventApiId } },
			);
			return response.event ?? response;
		},

		/** Iterate every guest of an event. */
		listGuests: (options: ListEventGuestsOptions) =>
			async function* (this: LumaClient): AsyncGenerator<LumaGuest> {
				for await (const entry of this.paginate<LumaGuestEntry>(
					"/v1/event/get-guests",
					{
						event_api_id: options.eventApiId,
						approval_status: options.approvalStatus,
						pagination_limit: options.paginationLimit,
						pagination_cursor: options.paginationCursor,
					},
				)) {
					const guest = entry.guest ?? (entry as unknown as LumaGuest);
					yield guest;
				}
			}.call(this),

		/** Collect every guest of an event into an array. */
		listAllGuests: (options: ListEventGuestsOptions) =>
			collect(this.events.listGuests(options)),

		/** Fetch a single guest, by guest `api_id` or by registration email. */
		getGuest: async (options: GetEventGuestOptions): Promise<LumaGuest> => {
			if (!options.guestApiId && !options.email) {
				throw new Error("getGuest requires either `guestApiId` or `email`");
			}
			const response = await this.request<{ guest?: LumaGuest } & LumaGuest>(
				"/v1/event/get-guest",
				{
					query: {
						event_api_id: options.eventApiId,
						api_id: options.guestApiId,
						email: options.email,
					},
				},
			);
			return response.guest ?? response;
		},

		/** Update a guest's approval status (approve, decline, waitlist…). */
		updateGuestStatus: async (options: UpdateGuestStatusOptions): Promise<void> => {
			await this.request("/v1/event/update-guest-status", {
				method: "POST",
				body: {
					event_api_id: options.eventApiId,
					guest_api_id: options.guestApiId,
					status: options.status,
				},
			});
		},
	};
}

const normalizeCoupon = (
	entry: LumaCouponEntry,
	fallbackCode?: string,
): LumaCoupon => ({
	...entry,
	api_id: entry.api_id ?? entry.id ?? "",
	code: entry.code ?? fallbackCode ?? "",
});
