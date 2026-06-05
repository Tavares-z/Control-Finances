import { Bricolage_Grotesque } from "next/font/google";

export const bricolage = Bricolage_Grotesque({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-bricolage",
	fallback: ["arial", "ui-sans-serif", "system-ui"],
	weight: ["500", "600", "700"],
	preload: true,
});
