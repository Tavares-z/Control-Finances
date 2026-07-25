import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/shared/lib/auth/config";
import { isSignupDisabled } from "@/shared/lib/auth/signup";

// Rotas protegidas que requerem autenticação
const PROTECTED_ROUTES = [
	"/settings",
	"/notes",
	"/calendar",
	"/cards",
	"/categories",
	"/accounts",
	"/dashboard",
	"/insights",
	"/transactions",
	"/budgets",
	"/payers",
	"/inbox",
	"/reports",
];

// Rotas públicas (não requerem autenticação)
const PUBLIC_AUTH_ROUTES = ["/login", "/signup"];

function buildCsp(): string {
	const isDev = process.env.NODE_ENV === "development";

	const s3Origin = (() => {
		try {
			return process.env.S3_ENDPOINT
				? new URL(process.env.S3_ENDPOINT).origin
				: "";
		} catch {
			return "";
		}
	})();

	const umamiOrigin = process.env.UMAMI_URL ?? "";

	const connectExtras = [umamiOrigin, s3Origin].filter(Boolean).join(" ");

	const imgExtras = [
		"https://lh3.googleusercontent.com",
		"https://img.logo.dev",
		s3Origin,
	]
		.filter(Boolean)
		.join(" ");

	return [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${umamiOrigin ? ` ${umamiOrigin}` : ""}`,
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' ${imgExtras} data: blob:`,
		"font-src 'self'",
		`connect-src 'self' ${connectExtras}`,
		// connect.pluggy.ai: iframe do widget Pluggy Connect (Open Finance).
		// A CSP é global e vai junto pro main no merge da F1 — risco nulo em prod
		// mesmo antes da F2: isto só permite FRAMING deste domínio específico; o
		// widget continua atrás de OPENFINANCE_ENABLED + connect token gerado no
		// server. Só frame-src precisa: o SDK não faz fetch/script-load a domínios
		// Pluggy no parent (as chamadas de API rodam dentro do iframe).
		`frame-src 'self' https://connect.pluggy.ai${s3Origin ? ` ${s3Origin}` : ""}`,
		"frame-ancestors 'none'",
	].join("; ");
}

export default async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Multi-domain: block all routes except landing on public domain
	// Normalize PUBLIC_DOMAIN: strip protocol and port if provided
	const publicDomain = process.env.PUBLIC_DOMAIN?.replace(
		/^https?:\/\//,
		"",
	).replace(/:\d+$/, "");
	const hostname = request.headers.get("host")?.replace(/:\d+$/, "");

	if (publicDomain && hostname === publicDomain) {
		if (pathname.startsWith("/api/")) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		if (pathname !== "/") {
			return NextResponse.redirect(new URL("/", request.url));
		}
		return NextResponse.next();
	}

	// Validate actual session, not just cookie existence
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	const isAuthenticated = !!session?.user;
	const signupDisabled = isSignupDisabled();

	if (signupDisabled) {
		if (pathname === "/signup" || pathname.startsWith("/signup/")) {
			return NextResponse.redirect(
				new URL(isAuthenticated ? "/dashboard" : "/login", request.url),
			);
		}

		if (pathname.startsWith("/api/auth/sign-up")) {
			return NextResponse.json(
				{ error: "Novos cadastros estão desativados." },
				{ status: 403 },
			);
		}
	}

	// Redirect authenticated users away from login/signup pages
	if (isAuthenticated && PUBLIC_AUTH_ROUTES.includes(pathname)) {
		return NextResponse.redirect(new URL("/dashboard", request.url));
	}

	// Redirect unauthenticated users trying to access protected routes
	const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
		pathname.startsWith(route),
	);

	if (!isAuthenticated && isProtectedRoute) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	const response = NextResponse.next();
	if (!pathname.startsWith("/api/")) {
		response.headers.set("Content-Security-Policy", buildCsp());
	}
	return response;
}

export const config = {
	// Apply middleware to protected and auth routes
	matcher: [
		"/",
		"/api/:path*",
		"/settings/:path*",
		"/notes/:path*",
		"/calendar/:path*",
		"/cards/:path*",
		"/categories/:path*",
		"/accounts/:path*",
		"/dashboard/:path*",
		"/insights/:path*",
		"/transactions/:path*",
		"/budgets/:path*",
		"/payers/:path*",
		"/inbox/:path*",
		"/reports/:path*",
		"/login",
		"/signup",
	],
};
