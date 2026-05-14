import { describe, expect, it } from "vitest";
import { LumaApiError } from "../errors";

const error = (status: number, body: string) =>
	new LumaApiError({ message: "boom", status, body, path: "/v1/x" });

describe("LumaApiError", () => {
	it("flags auth statuses", () => {
		expect(error(401, "").isAuthError).toBe(true);
		expect(error(403, "").isAuthError).toBe(true);
		expect(error(500, "").isAuthError).toBe(false);
	});

	it("flags rate-limited responses", () => {
		expect(error(429, "").isRateLimited).toBe(true);
		expect(error(400, "").isRateLimited).toBe(false);
	});

	it("detects duplicate coupon code errors permissively", () => {
		expect(error(409, "Coupon code already exists").isDuplicateCouponCode).toBe(
			true,
		);
		expect(error(400, "A coupon with this code exists").isDuplicateCouponCode).toBe(
			true,
		);
		expect(error(400, "invalid valid_end_at").isDuplicateCouponCode).toBe(false);
		expect(error(500, "code already exists").isDuplicateCouponCode).toBe(false);
	});

	it("retains the raw body and path for diagnostics", () => {
		const err = error(422, '{"error":"bad"}');
		expect(err.body).toBe('{"error":"bad"}');
		expect(err.path).toBe("/v1/x");
		expect(err).toBeInstanceOf(Error);
	});
});
