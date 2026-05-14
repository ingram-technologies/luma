/**
 * Thrown when the Luma API responds with a non-2xx status, or when a response
 * body cannot be parsed as JSON.
 */
export class LumaApiError extends Error {
	/** HTTP status code returned by Luma (0 if the request never completed). */
	readonly status: number;
	/** Raw, untruncated response body. */
	readonly body: string;
	/** API path that produced the error, e.g. `/v1/event/get-guests`. */
	readonly path: string;

	constructor(params: {
		message: string;
		status: number;
		body: string;
		path: string;
	}) {
		super(params.message);
		this.name = "LumaApiError";
		this.status = params.status;
		this.body = params.body;
		this.path = params.path;
	}

	/** True for 401/403 — the API key is missing, invalid, or lacks scope. */
	get isAuthError(): boolean {
		return this.status === 401 || this.status === 403;
	}

	/** True for 429 — the caller is being rate limited. */
	get isRateLimited(): boolean {
		return this.status === 429;
	}

	/**
	 * True when Luma rejected a coupon create because the code already exists.
	 * Luma surfaces this as a 400/409 whose body mentions the code already
	 * existing; matched permissively so callers can treat it as idempotent.
	 */
	get isDuplicateCouponCode(): boolean {
		const lower = this.body.toLowerCase();
		return (
			(this.status === 400 || this.status === 409) &&
			lower.includes("code") &&
			(lower.includes("exist") || lower.includes("already"))
		);
	}
}
