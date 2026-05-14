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
