import { describe, expect, it } from "vitest";
import { authUrlFromEvent, renderAuthEvent } from "../src/login.ts";

describe("OAuth event presentation", () => {
	it("returns an auth URL without a command-style prefix", () => {
		const url = "https://auth.example.test/authorize?state=abc";
		expect(authUrlFromEvent({ type: "auth_url", url })).toBe(url);
		expect(renderAuthEvent({ type: "auth_url", url })).toBe(url);
	});

	it("falls back to readable text for non-URL events", () => {
		expect(
			authUrlFromEvent({
				type: "device_code",
				verificationUri: "https://auth.example.test/device",
				userCode: "ABCD",
			}),
		).toBe("Go to https://auth.example.test/device and enter code: ABCD");
	});
});
