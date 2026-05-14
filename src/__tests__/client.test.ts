import { describe, expect, it } from "vitest";
import { collect, LumaClient } from "../client";
import { LumaApiError } from "../errors";

interface RecordedCall {
	url: URL;
	init: RequestInit;
}

type Handler = (call: RecordedCall, index: number) => Response;

const mockFetch = (handler: Handler) => {
	const calls: RecordedCall[] = [];
	const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
		const href =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		const call: RecordedCall = { url: new URL(href), init: init ?? {} };
		calls.push(call);
		return Promise.resolve(handler(call, calls.length - 1));
	}) as typeof fetch;
	return { fetchImpl, calls };
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const headerValue = (init: RequestInit, name: string): string | undefined => {
	const headers = init.headers as Record<string, string> | undefined;
	return headers?.[name];
};

const requireCall = (calls: RecordedCall[], index: number): RecordedCall => {
	const call = calls[index];
	if (!call) {
		throw new Error(`expected a request at index ${index}`);
	}
	return call;
};

describe("LumaClient.request", () => {
	it("sends the API key header and serialises query params", async () => {
		const { fetchImpl, calls } = mockFetch(() => json({ ok: true }));
		const client = new LumaClient({ apiKey: "secret", fetch: fetchImpl });

		const after = new Date("2026-02-01T00:00:00.000Z");
		const result = await client.request<{ ok: boolean }>("/v1/ping", {
			query: { after, skip: undefined, page: 2 },
		});

		expect(result).toEqual({ ok: true });
		const call = requireCall(calls, 0);
		expect(call.url.pathname).toBe("/v1/ping");
		expect(call.url.searchParams.get("after")).toBe(after.toISOString());
		expect(call.url.searchParams.get("page")).toBe("2");
		expect(call.url.searchParams.has("skip")).toBe(false);
		expect(headerValue(call.init, "x-luma-api-key")).toBe("secret");
	});

	it("throws LumaApiError on a non-2xx response", async () => {
		const { fetchImpl } = mockFetch(() => new Response("nope", { status: 404 }));
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		await expect(client.request("/v1/missing")).rejects.toMatchObject({
			name: "LumaApiError",
			status: 404,
			body: "nope",
			path: "/v1/missing",
		});
	});

	it("throws LumaApiError when the body is not JSON", async () => {
		const { fetchImpl } = mockFetch(() => new Response("<html>", { status: 200 }));
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		await expect(client.request("/v1/weird")).rejects.toBeInstanceOf(LumaApiError);
	});
});

describe("LumaClient.paginate", () => {
	it("follows next_cursor until has_more is false", async () => {
		const { fetchImpl, calls } = mockFetch((_call, index) =>
			index === 0
				? json({ entries: [{ id: 1 }], has_more: true, next_cursor: "c2" })
				: json({ entries: [{ id: 2 }], has_more: false, next_cursor: null }),
		);
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		const entries = await collect(client.paginate<{ id: number }>("/v1/things"));

		expect(entries).toEqual([{ id: 1 }, { id: 2 }]);
		expect(calls).toHaveLength(2);
		expect(requireCall(calls, 0).url.searchParams.has("pagination_cursor")).toBe(
			false,
		);
		expect(requireCall(calls, 1).url.searchParams.get("pagination_cursor")).toBe(
			"c2",
		);
	});
});

describe("LumaClient.calendar", () => {
	it("lists every event across pages with the calendar id attached", async () => {
		const { fetchImpl, calls } = mockFetch((_call, index) =>
			index === 0
				? json({
						entries: [
							{ event: { api_id: "e1", name: "A", start_at: "x" } },
						],
						has_more: true,
						next_cursor: "next",
					})
				: json({
						entries: [
							{ event: { api_id: "e2", name: "B", start_at: "y" } },
						],
						has_more: false,
					}),
		);
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		const events = await client.calendar.listAllEvents({
			calendarApiId: "cal-123",
		});

		expect(events.map((e) => e.event?.api_id)).toEqual(["e1", "e2"]);
		expect(requireCall(calls, 0).url.searchParams.get("calendar_api_id")).toBe(
			"cal-123",
		);
	});

	it("maps an amount discount when creating a coupon", async () => {
		const { fetchImpl, calls } = mockFetch(() =>
			json({ coupon: { api_id: "cp_1", code: "SUMMIT" } }),
		);
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		const coupon = await client.calendar.createCoupon({
			code: "SUMMIT",
			remainingCount: 1,
			discount: { type: "amount", centsOff: 4000, currency: "EUR" },
		});

		expect(coupon).toMatchObject({ api_id: "cp_1", code: "SUMMIT" });
		const call = requireCall(calls, 0);
		expect(call.init.method).toBe("POST");
		const body = JSON.parse(call.init.body as string);
		expect(body.discount).toEqual({
			discount_type: "amount",
			cents_off: 4000,
			currency: "eur",
		});
	});
});

describe("LumaClient.events", () => {
	it("posts the guest status update payload", async () => {
		const { fetchImpl, calls } = mockFetch(() => new Response("", { status: 200 }));
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		await client.events.updateGuestStatus({
			eventApiId: "evt-1",
			guestApiId: "gst-1",
			status: "approved",
		});

		const call = requireCall(calls, 0);
		expect(call.init.method).toBe("POST");
		expect(JSON.parse(call.init.body as string)).toEqual({
			event_api_id: "evt-1",
			guest_api_id: "gst-1",
			status: "approved",
		});
	});

	it("unwraps the nested guest object from get-guests entries", async () => {
		const { fetchImpl } = mockFetch(() =>
			json({
				entries: [{ guest: { api_id: "g1", email: "a@b.com" } }],
				has_more: false,
			}),
		);
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		const guests = await client.events.listAllGuests({ eventApiId: "evt-1" });
		expect(guests).toEqual([{ api_id: "g1", email: "a@b.com" }]);
	});

	it("requires a lookup key for getGuest", async () => {
		const { fetchImpl } = mockFetch(() => json({}));
		const client = new LumaClient({ apiKey: "k", fetch: fetchImpl });

		await expect(client.events.getGuest({ eventApiId: "evt-1" })).rejects.toThrow(
			/guestApiId|email/,
		);
	});
});

describe("LumaClient.fromEnv", () => {
	it("throws when LUMA_API_KEY is absent", () => {
		expect(() => LumaClient.fromEnv({})).toThrow(/LUMA_API_KEY/);
	});

	it("builds a client from the environment", () => {
		const client = LumaClient.fromEnv({ LUMA_API_KEY: "from-env" });
		expect(client).toBeInstanceOf(LumaClient);
		expect(client.baseUrl).toBe("https://public-api.luma.com");
	});
});
