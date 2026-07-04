/**
 * Types for the Luma public API.
 *
 * Luma does not publish a machine-readable schema, and several fields are
 * optional or vary between plan tiers. Object types therefore carry an index
 * signature so unmodelled fields remain accessible without a cast. When in
 * doubt, reach for {@link import("./client").LumaClient.request} and type the
 * response yourself.
 */

/** A cursor-paginated list response. */
export interface LumaPaginatedResponse<T> {
	entries: T[];
	has_more?: boolean;
	next_cursor?: string | null;
}

/** Options shared by every cursor-paginated endpoint. */
export interface LumaPaginationOptions {
	/** Opaque cursor returned as `next_cursor` by a previous page. */
	paginationCursor?: string;
	/** Page size. Luma's default and maximum vary by endpoint. */
	paginationLimit?: number;
}

// ─── Events ──────────────────────────────────────────────────────────────

export interface LumaEventTag {
	api_id: string;
	name: string;
	[key: string]: unknown;
}

export interface LumaEventLocation {
	type?: string;
	name?: string;
	address?: string;
	[key: string]: unknown;
}

export interface LumaEvent {
	api_id: string;
	name: string;
	description?: string;
	start_at: string;
	end_at?: string;
	timezone?: string;
	url?: string;
	cover_url?: string;
	visibility?: string;
	location?: LumaEventLocation;
	guest_limit?: number | null;
	guest_count?: number;
	[key: string]: unknown;
}

/**
 * An entry in `calendar/list-events`. Luma nests the event under `event` and
 * places calendar-scoped metadata (tags) alongside it.
 */
export interface LumaCalendarEntry {
	api_id?: string;
	event?: LumaEvent;
	tags?: LumaEventTag[];
	[key: string]: unknown;
}

export interface ListCalendarEventsOptions extends LumaPaginationOptions {
	/** Calendar to list events for. Required. */
	calendarApiId: string;
	/** Only events starting at or after this instant. */
	after?: Date | string;
	/** Only events starting at or before this instant. */
	before?: Date | string;
}

// ─── People ──────────────────────────────────────────────────────────────

export interface LumaPerson {
	api_id: string;
	name?: string;
	email?: string;
	avatar_url?: string;
	[key: string]: unknown;
}

export interface ListCalendarPeopleOptions extends LumaPaginationOptions {
	calendarApiId: string;
}

// ─── Guests ──────────────────────────────────────────────────────────────

export type LumaGuestApprovalStatus =
	| "approved"
	| "declined"
	| "pending_approval"
	| "waitlist"
	| "invited"
	| (string & {});

export interface LumaGuest {
	api_id: string;
	name?: string;
	email?: string;
	user_api_id?: string;
	approval_status?: LumaGuestApprovalStatus;
	registered_at?: string;
	checked_in_at?: string | null;
	event_ticket?: {
		api_id?: string;
		name?: string;
		[key: string]: unknown;
	};
	/** Answers to the event's registration questions, when present. */
	registration_answers?: Array<{
		label?: string;
		answer?: string;
		question_id?: string;
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
}

/** An entry in `event/get-guests`. Luma nests the guest under `guest`. */
export interface LumaGuestEntry {
	api_id?: string;
	guest?: LumaGuest;
	[key: string]: unknown;
}

export interface ListEventGuestsOptions extends LumaPaginationOptions {
	eventApiId: string;
	/** Filter by approval status, when supported by the endpoint. */
	approvalStatus?: LumaGuestApprovalStatus;
}

export interface GetEventGuestOptions {
	eventApiId: string;
	/** Look the guest up by their guest api_id… */
	guestApiId?: string;
	/** …or by the email they registered with. One of the two is required. */
	email?: string;
}

export interface UpdateGuestStatusOptions {
	eventApiId: string;
	guestApiId: string;
	status: LumaGuestApprovalStatus;
}

// ─── Ticket types ────────────────────────────────────────────────────────

/**
 * A ticket type (tier) on an event, as returned by
 * `/v1/events/ticket-types/*`. Prices are in the currency's minor unit
 * (`cents`); free tickets carry `type: "free"` and a null price.
 */
export interface LumaTicketType {
	/** Ticket-type id, usually prefixed `evtticktype-`. */
	id: string;
	name: string;
	/** `"free"` or `"paid"`. Luma may introduce further values. */
	type: "free" | "paid" | (string & {});
	/** Price in the currency's minor unit (e.g. `4000` = €40), or null. */
	cents: number | null;
	/** ISO 4217 code, lower-cased as Luma returns it (e.g. `eur`), or null. */
	currency: string | null;
	/** Whether the buyer may choose the amount (pay-what-you-want). */
	is_flexible?: boolean;
	/** For flexible tickets, the minimum amount in minor units. */
	min_cents?: number | null;
	require_approval?: boolean;
	is_hidden?: boolean;
	description?: string | null;
	valid_start_at?: string | null;
	valid_end_at?: string | null;
	max_capacity?: number | null;
	[key: string]: unknown;
}

export interface ListTicketTypesOptions {
	eventApiId: string;
	/** Include hidden ticket types in the result. */
	includeHidden?: boolean;
}

/** Fields shared by ticket-type create and update. */
interface TicketTypeWriteFields {
	name?: string;
	/** Price in the currency's minor unit. Required for paid tickets. */
	cents?: number | null;
	/** ISO 4217 code (e.g. `eur`). */
	currency?: string | null;
	requireApproval?: boolean;
	isHidden?: boolean;
	description?: string | null;
	/** Pay-what-you-want ticket. */
	isFlexible?: boolean;
	minCents?: number | null;
	maxCapacity?: number | null;
	validStartAt?: Date | string | null;
	validEndAt?: Date | string | null;
}

export interface CreateTicketTypeInput extends TicketTypeWriteFields {
	eventApiId: string;
	name: string;
	type: "free" | "paid";
}

export interface UpdateTicketTypeInput extends TicketTypeWriteFields {
	ticketTypeApiId: string;
	type?: "free" | "paid";
}

/** A guest to add via {@link import("./client").LumaClient.events.addGuests}. */
export interface AddGuestInput {
	email: string;
	name?: string;
	/** Answers to the event's registration questions, if any. */
	registrationAnswers?: unknown[];
}

export interface AddGuestsOptions {
	eventApiId: string;
	/** The guests to add. At least one is required. */
	guests: AddGuestInput[];
	/** Assign one ticket of this ticket type to each added guest. */
	ticketTypeApiId?: string;
	/** Initial status. Defaults to `approved` ("Going"). */
	approvalStatus?: LumaGuestApprovalStatus;
	/** Whether Luma emails each added guest. Defaults to true. */
	sendEmail?: boolean;
}

// ─── Coupons ─────────────────────────────────────────────────────────────

export interface LumaCoupon {
	api_id: string;
	code: string;
	[key: string]: unknown;
}

export interface LumaCouponEntry {
	api_id?: string;
	id?: string;
	code?: string;
	[key: string]: unknown;
}

export interface CreateCalendarCouponInput {
	code: string;
	/** Number of times the coupon may be redeemed. */
	remainingCount?: number;
	validStartAt?: Date | string;
	validEndAt?: Date | string;
	discount:
		| {
				type: "percent";
				/** Whole-percent value, e.g. `25` for 25% off. */
				percentOff: number;
		  }
		| {
				type: "amount";
				/** Discount in the currency's minor unit, e.g. `4000` = €40. */
				centsOff: number;
				/** ISO 4217 code, lowercased by the client (e.g. `eur`). */
				currency: string;
		  };
}
