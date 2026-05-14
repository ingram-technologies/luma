# @ingram-tech/luma

TypeScript client for the [Luma](https://lu.ma) (lu.ma) public API.

Small, dependency-free, ESM-only. Wraps the endpoints needed to mirror a Luma
calendar — events, guests, people, coupons — and exposes typed escape hatches
for everything else.

> Unofficial. Not affiliated with or endorsed by Luma. "Luma" is a trademark of
> its respective owner.

## Install

```sh
bun add @ingram-tech/luma
# or: npm install @ingram-tech/luma
```

Requires Node.js 18+ (uses the global `fetch`). A Luma **API key** is needed —
available under *Calendar Settings → API* on a Luma Plus plan.

## Usage

```ts
import { LumaClient } from "@ingram-tech/luma";

const luma = new LumaClient({ apiKey: process.env.LUMA_API_KEY! });
// or: const luma = LumaClient.fromEnv();   // reads LUMA_API_KEY

// Iterate every event on a calendar (auto-paginates).
for await (const entry of luma.calendar.listEvents({ calendarApiId })) {
	console.log(entry.event?.name);
}

// …or collect them into an array.
const events = await luma.calendar.listAllEvents({ calendarApiId });

// Guests of an event.
const guests = await luma.events.listAllGuests({ eventApiId });

// A single guest, by email.
const guest = await luma.events.getGuest({ eventApiId, email: "a@b.com" });

// Approve a guest.
await luma.events.updateGuestStatus({
	eventApiId,
	guestApiId: guest.api_id,
	status: "approved",
});

// Coupons.
const coupon = await luma.calendar.createCoupon({
	code: "SUMMIT-2027",
	remainingCount: 1,
	discount: { type: "amount", centsOff: 4000, currency: "EUR" },
});
```

### Pagination

Cursor-paginated methods (`listEvents`, `listPeople`, `listGuests`,
`listCoupons`) return an `AsyncGenerator` that follows `next_cursor`
automatically. Each has a `listAll…` sibling that drains it into an array.
`collect()` is exported for draining any async iterable.

### Escape hatches

The typed methods cover the endpoints this client is built around. For
anything not modelled, call the API directly — both methods are public:

```ts
// Any endpoint, typed by you.
const data = await luma.request<MyType>("/v1/event/get", {
	query: { api_id: eventApiId },
});

// Any cursor-paginated endpoint.
for await (const entry of luma.paginate<MyEntry>("/v1/some/list", { foo: "bar" })) {
	// …
}
```

`request` also accepts `fetchInit` for passing through framework-specific
options, e.g. Next.js cache hints:

```ts
await luma.request("/v1/calendar/list-events", {
	query: { calendar_api_id },
	fetchInit: { next: { revalidate: 300 } },
});
```

### Errors

Non-2xx responses (and non-JSON bodies) throw `LumaApiError`, which carries the
`status`, raw `body`, and `path`, plus convenience getters:

```ts
import { LumaApiError } from "@ingram-tech/luma";

try {
	await luma.calendar.createCoupon({ code: "DUP", discount: { type: "percent", percentOff: 10 } });
} catch (err) {
	if (err instanceof LumaApiError && err.isDuplicateCouponCode) {
		// coupon already exists — treat as idempotent
	}
}
```

`isAuthError` (401/403) and `isRateLimited` (429) are also provided.

## API coverage

| Area | Methods |
| --- | --- |
| Calendar events | `calendar.listEvents`, `calendar.listAllEvents` |
| Calendar people | `calendar.listPeople`, `calendar.listAllPeople` |
| Coupons | `calendar.listCoupons`, `calendar.findCouponByCode`, `calendar.createCoupon` |
| Events | `events.get` |
| Guests | `events.listGuests`, `events.listAllGuests`, `events.getGuest`, `events.updateGuestStatus` |
| Anything else | `request`, `paginate` |

Luma does not publish a machine-readable schema. The calendar-events and
coupon paths are exercised in production; the guest and people paths are
modelled from Luma's public API documentation. Response objects carry an index
signature, so unmodelled fields are always reachable. PRs welcome.

## Development

```sh
bun install
bun run ci          # type-check, lint, test, build
bun run test        # watch mode
```

## License

MIT © Ingram Technologies
