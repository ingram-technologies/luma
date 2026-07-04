/**
 * Types for the Luma public API.
 *
 * Object shapes (events, guests, ticket types, coupons…) are derived straight
 * from Luma's published OpenAPI via {@link ResponseOf}, so they never drift
 * from the live API. The hand-written pieces here are the ergonomic *inputs* —
 * camelCase option objects the client maps onto Luma's snake_case wire format —
 * plus a couple of unions the spec leaves open. For anything not modelled as a
 * resource method, reach for {@link import("./client").LumaClient.request} and
 * the {@link ResponseOf}/{@link QueryOf}/{@link BodyOf} helpers.
 */
import type { BodyOf, ResponseOf } from "./openapi";

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

/** A full event, as returned by `GET /v1/events/get`. */
export type LumaEvent = ResponseOf<"/v1/events/get", "get">;

/** An event as listed on a calendar (`GET /v1/calendars/events/list`). */
export type LumaCalendarEvent = ResponseOf<
	"/v1/calendars/events/list",
	"get"
>["entries"][number];

export interface ListCalendarEventsOptions extends LumaPaginationOptions {
	/** Only events starting at or after this instant. */
	after?: Date | string;
	/** Only events starting at or before this instant. */
	before?: Date | string;
	/** Filter by calendar submission status. Defaults to `approved`. */
	status?: "approved" | "pending";
	/**
	 * Which access levels to include. Defaults to `["manage"]`. Include
	 * `"view"` to also return events the calendar lists but doesn't manage.
	 */
	access?: Array<"manage" | "view">;
	/** Event platforms to include. Defaults to `["luma"]`. */
	platforms?: Array<"luma" | "external">;
	sortDirection?: "asc" | "desc";
}

// ─── Contacts (people) ─────────────────────────────────────────────────────

/** A contact on the calendar (`GET /v1/calendars/contacts/list`). */
export type LumaContact = ResponseOf<
	"/v1/calendars/contacts/list",
	"get"
>["entries"][number];

export interface ListContactsOptions extends LumaPaginationOptions {
	/** Free-text search over name/email. */
	query?: string;
	sortDirection?: "asc" | "desc";
}

// ─── Guests ──────────────────────────────────────────────────────────────

/** A guest as listed on an event (`GET /v1/events/guests/list`). */
export type LumaGuest = ResponseOf<"/v1/events/guests/list", "get">["entries"][number];

/** A single guest with order detail (`GET /v1/events/guests/get`). */
export type LumaGuestDetail = ResponseOf<"/v1/events/guests/get", "get">;

/**
 * Approval status of a guest. The status *values* Luma accepts on
 * update-status come from the spec; guests may additionally surface as
 * `invited`, and the open-ended member keeps forward compatibility.
 */
export type LumaGuestApprovalStatus =
	| NonNullable<BodyOf<"/v1/events/guests/update-status", "post">>["status"]
	| "invited"
	| (string & {});

export interface ListEventGuestsOptions extends LumaPaginationOptions {
	eventId: string;
	/** Filter by approval status. */
	approvalStatus?: LumaGuestApprovalStatus;
	sortDirection?: "asc" | "desc";
}

export interface GetEventGuestOptions {
	eventId: string;
	/** The guest's id (`gst-…`). */
	guestId: string;
}

export interface UpdateGuestStatusOptions {
	eventId: string;
	guestId: string;
	status: LumaGuestApprovalStatus;
	/** Refund the guest's tickets when declining, if applicable. */
	shouldRefund?: boolean;
	/** Whether Luma emails the guest about the change. */
	sendEmail?: boolean;
	/** Optional message included in the notification. */
	message?: string;
}

/** A guest to add via {@link import("./client").LumaClient.events.addGuests}. */
export interface AddGuestInput {
	email: string;
	name?: string;
	/** Answers to the event's registration questions, if any. */
	registrationAnswers?: unknown[];
}

export interface AddGuestsOptions {
	eventId: string;
	/** The guests to add. At least one is required. */
	guests: AddGuestInput[];
	/** Assign one ticket of this ticket type to each added guest. */
	ticketTypeId?: string;
	/** Initial status. Defaults to `approved` ("Going"). */
	approvalStatus?: "approved" | "pending_approval" | "waitlist";
	/** Whether Luma emails each added guest. Defaults to true. */
	sendEmail?: boolean;
}

// ─── Ticket types ────────────────────────────────────────────────────────

/** A ticket type (tier) on an event, incl. price (`cents`/`currency`). */
export type LumaTicketType = ResponseOf<
	"/v1/events/ticket-types/list",
	"get"
>["entries"][number];

export interface ListTicketTypesOptions {
	eventId: string;
	/** Include hidden ticket types in the result. */
	includeHidden?: boolean;
}

/** Fields shared by ticket-type create and update. */
interface TicketTypeWriteFields {
	name?: string;
	/** Price in the currency's minor unit. Required for paid tickets. */
	cents?: number | null;
	/** ISO 4217 code (e.g. `eur`); lower-cased by the client. */
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
	eventId: string;
	name: string;
	type: "free" | "paid";
}

export interface UpdateTicketTypeInput extends TicketTypeWriteFields {
	ticketTypeId: string;
	type?: "free" | "paid";
}

// ─── Coupons ─────────────────────────────────────────────────────────────

/** A coupon on the calendar (`/v1/calendars/coupons`). */
export type LumaCoupon = ResponseOf<
	"/v1/calendars/coupons/list",
	"get"
>["entries"][number];

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
