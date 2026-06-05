import { connection } from "next/server";
import { fetchDashboardNavbarData } from "@/features/dashboard/lib/navbar-queries";
import { AppNavbar } from "@/shared/components/navigation/navbar/app-navbar";
import { AppPreferencesProvider } from "@/shared/components/providers/app-preferences-provider";
import { LogoDevProvider } from "@/shared/components/providers/logo-dev-provider";
import { PrivacyProvider } from "@/shared/components/providers/privacy-provider";
import { getUserSession } from "@/shared/lib/auth/server";
import { isLogoDevEnabled } from "@/shared/lib/logo/server";
import { ChatWidget } from "@/features/chat/components/chat-widget";
import { fetchAppPreferences } from "@/shared/lib/preferences/queries";
import { fetchUserPreferences } from "@/features/settings/queries";

export default async function DashboardLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	await connection();
	const session = await getUserSession();
	const [navbarData, appPreferences] = await Promise.all([
		fetchDashboardNavbarData(session.user.id),
		fetchAppPreferences(session.user.id),
	]);
	const logoDevEnabled = isLogoDevEnabled();
	const userPreferences = await fetchUserPreferences(session.user.id);
	const chatModel = userPreferences?.chatModel ?? "google/gemini-3.5-flash";

	return (
		<LogoDevProvider enabled={logoDevEnabled}>
			<AppPreferencesProvider {...appPreferences}>
				<PrivacyProvider>
					<AppNavbar
						user={{ ...session.user, image: session.user.image ?? null }}
						payerAvatarUrl={navbarData.payerAvatarUrl}
						inboxPendingCount={navbarData.inboxPendingCount}
						notificationsSnapshot={navbarData.notificationsSnapshot}
						financeLinks={navbarData.financeLinks}
					/>
					<div className="relative flex flex-1 flex-col pt-16">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-5 md:gap-6 w-full max-w-8xl mx-auto px-4 ">
								{children}
							</div>
						</div>
					</div>
					<ChatWidget currentModel={chatModel} />
				</PrivacyProvider>
			</AppPreferencesProvider>
		</LogoDevProvider>
	);
}
