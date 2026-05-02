import { randomBytes } from "node:crypto";

export const generateShareCode = (): string => {
	return randomBytes(18).toString("base64url").slice(0, 24);
};
