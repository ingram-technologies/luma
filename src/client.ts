import { LUMA_API_BASE_URL, LUMA_API_KEY_HEADER } from "./constants";
import { LumaApiError } from "./errors";
import type {
	AddGuestsOptions,
	CreateCalendarCouponInput,
	CreateTicketTypeInput,
	GetEventGuestOptions,
	ListCalendarEventsOptions,
	ListContactsOptions,
	ListEventGuestsOptions,
	ListTicketTypesOptions,
	LumaCalendarEvent,
	LumaContact,
	LumaCoupon,
	LumaEvent,
	LumaGuest,
	LumaGuestDetail,
	LumaPaginatedResponse,
	LumaTicketType,
	UpdateGuestStatusOptions,
	UpdateTicketTypeInput,
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

/** Like {@link toIso} but passes `null`/`undefined` through untouched, so a
 * caller can clear a field (`null`) or leave it unset (`undefined`). */
const toIsoNullable = (
	value: Date | string | null | undefined,
): string | null | undefined => (value == null ? value : toIso(value));

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
	 * the base URL, e.g. `/v1/events/get`.
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
	//
	// The calendar is inferred from the API key, so these take no calendar id.

	readonly calendar = {
		/** Iterate every event the calendar manages. */
		listEvents: (options: ListCalendarEventsOptions = {}) =>
			this.paginate<LumaCalendarEvent>("/v1/calendars/events/list", {
				after: options.after,
				before: options.before,
				status: options.status,
				access: options.access,
				platforms: options.platforms,
				sort_direction: options.sortDirection,
				pagination_limit: options.paginationLimit,
				pagination_cursor: options.paginationCursor,
			}),

		/** Collect every event the calendar manages into an array. */
		listAllEvents: (options: ListCalendarEventsOptions = {}) =>
			collect(this.calendar.listEvents(options)),

		/** Iterate every contact on the calendar. */
		listContacts: (options: ListContactsOptions = {}) =>
			this.paginate<LumaContact>("/v1/calendars/contacts/list", {
				query: options.query,
				sort_direction: options.sortDirection,
				pagination_limit: options.paginationLimit,
				pagination_cursor: options.paginationCursor,
			}),

		/** Collect every contact on the calendar into an array. */
		listAllContacts: (options: ListContactsOptions = {}) =>
			collect(this.calendar.listContacts(options)),

		/** Iterate every coupon on the calendar tied to the API key. */
		listCoupons: (): AsyncGenerator<LumaCoupon> =>
			this.paginate<LumaCoupon>("/v1/calendars/coupons/list"),

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

		/** Create a calendar coupon (applies to any event the calendar manages). */
		createCoupon: (input: CreateCalendarCouponInput): Promise<LumaCoupon> =>
			this.request<LumaCoupon>("/v1/calendars/coupons/create", {
				method: "POST",
				body: {
					code: input.code,
					remaining_count: input.remainingCount,
					valid_start_at: toIsoNullable(input.validStartAt),
					valid_end_at: toIsoNullable(input.validEndAt),
					discount:
						input.discount.type === "percent"
							? {
									discount_type: "percent",
									percent_off: input.discount.percentOff,
								}
							: {
									discount_type: "amount",
									cents_off: input.discount.centsOff,
									currency: input.discount.currency.toLowerCase(),
								},
				},
			}),
	};

	// ─── events ──────────────────────────────────────────────────────────

	readonly events = {
		/** Fetch a single event by its id (`evt-…`). */
		get: (eventId: string): Promise<LumaEvent> =>
			this.request<LumaEvent>("/v1/events/get", {
				query: { event_id: eventId },
			}),

		/** Iterate every guest of an event. */
		listGuests: (options: ListEventGuestsOptions) =>
			this.paginate<LumaGuest>("/v1/events/guests/list", {
				event_id: options.eventId,
				approval_status: options.approvalStatus,
				sort_direction: options.sortDirection,
				pagination_limit: options.paginationLimit,
				pagination_cursor: options.paginationCursor,
			}),

		/** Collect every guest of an event into an array. */
		listAllGuests: (options: ListEventGuestsOptions) =>
			collect(this.events.listGuests(options)),

		/** Fetch a single guest (with order detail) by its guest id. */
		getGuest: (options: GetEventGuestOptions): Promise<LumaGuestDetail> =>
			this.request<LumaGuestDetail>("/v1/events/guests/get", {
				query: { event_id: options.eventId, id: options.guestId },
			}),

		/** Update a guest's approval status (approve, decline, waitlist…). */
		updateGuestStatus: async (options: UpdateGuestStatusOptions): Promise<void> => {
			await this.request("/v1/events/guests/update-status", {
				method: "POST",
				body: {
					event_id: options.eventId,
					guest_id: options.guestId,
					status: options.status,
					should_refund: options.shouldRefund,
					send_email: options.sendEmail,
					message: options.message,
				},
			});
		},

		/**
		 * Add guests to an event (host-side). Registers people directly — this
		 * does NOT take payment; Luma owns checkout/payment on its hosted flow.
		 * By default guests are added as approved ("Going") and emailed. Pass a
		 * `ticketTypeId` to assign each guest a ticket of that type.
		 */
		addGuests: async (options: AddGuestsOptions): Promise<void> => {
			await this.request("/v1/events/guests/add", {
				method: "POST",
				body: {
					event_id: options.eventId,
					guests: options.guests.map((guest) => ({
						email: guest.email,
						name: guest.name,
						registration_answers: guest.registrationAnswers,
					})),
					ticket: options.ticketTypeId
						? { event_ticket_type_id: options.ticketTypeId }
						: undefined,
					approval_status: options.approvalStatus,
					send_email: options.sendEmail,
				},
			});
		},

		/**
		 * List an event's ticket types (tiers), including prices. Pass
		 * `includeHidden` to include ticket types not shown on the public page.
		 */
		listTicketTypes: async (
			options: ListTicketTypesOptions,
		): Promise<LumaTicketType[]> => {
			const response = await this.request<{ entries?: LumaTicketType[] }>(
				"/v1/events/ticket-types/list",
				{
					query: {
						event_id: options.eventId,
						include_hidden: options.includeHidden,
					},
				},
			);
			return response.entries ?? [];
		},

		/** Fetch a single ticket type by its id. */
		getTicketType: (ticketTypeId: string): Promise<LumaTicketType> =>
			this.request<LumaTicketType>("/v1/events/ticket-types/get", {
				query: { event_ticket_type_id: ticketTypeId },
			}),

		/** Create a ticket type on an event. */
		createTicketType: (input: CreateTicketTypeInput): Promise<LumaTicketType> =>
			this.request<LumaTicketType>("/v1/events/ticket-types/create", {
				method: "POST",
				body: ticketTypeBody(
					{ event_id: input.eventId, type: input.type },
					input,
				),
			}),

		/** Update an existing ticket type. */
		updateTicketType: (input: UpdateTicketTypeInput): Promise<LumaTicketType> =>
			this.request<LumaTicketType>("/v1/events/ticket-types/update", {
				method: "POST",
				body: ticketTypeBody(
					{ event_ticket_type_id: input.ticketTypeId, type: input.type },
					input,
				),
			}),

		/** Delete a ticket type by its id. */
		deleteTicketType: async (ticketTypeId: string): Promise<void> => {
			await this.request("/v1/events/ticket-types/delete", {
				method: "POST",
				body: { event_ticket_type_id: ticketTypeId },
			});
		},
	};
}

/** Build the snake_case body shared by ticket-type create and update. Keys
 * left `undefined` are dropped by `JSON.stringify`; explicit `null` is sent. */
const ticketTypeBody = (
	base: Record<string, unknown>,
	fields: {
		name?: string;
		cents?: number | null;
		currency?: string | null;
		requireApproval?: boolean;
		isHidden?: boolean;
		description?: string | null;
		isFlexible?: boolean;
		minCents?: number | null;
		maxCapacity?: number | null;
		validStartAt?: Date | string | null;
		validEndAt?: Date | string | null;
	},
): Record<string, unknown> => ({
	...base,
	name: fields.name,
	cents: fields.cents,
	currency: fields.currency == null ? fields.currency : fields.currency.toLowerCase(),
	require_approval: fields.requireApproval,
	is_hidden: fields.isHidden,
	description: fields.description,
	is_flexible: fields.isFlexible,
	min_cents: fields.minCents,
	max_capacity: fields.maxCapacity,
	valid_start_at: toIsoNullable(fields.validStartAt),
	valid_end_at: toIsoNullable(fields.validEndAt),
});
