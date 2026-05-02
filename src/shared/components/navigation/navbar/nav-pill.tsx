"use client";

import { usePathname } from "next/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";
import { NavLink } from "./nav-link";

type NavPillProps = {
	href: string;
	preservePeriod?: boolean;
	children: React.ReactNode;
};

export function NavPill({ href, preservePeriod, children }: NavPillProps) {
	const pathname = usePathname();

	const isActive =
		href === "/dashboard"
			? pathname === href
			: pathname === href || pathname.startsWith(`${href}/`);

	return (
		<NavLink
			href={href}
			preservePeriod={preservePeriod}
			className={cn(
				buttonVariants({ variant: "navbar", size: "sm" }),
				"h-9 capitalize text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-primary-foreground/20 dark:text-foreground/75 dark:hover:bg-foreground/10 dark:hover:text-foreground dark:focus-visible:ring-foreground/20",
				isActive &&
					"bg-primary-foreground/15 text-primary-foreground dark:bg-foreground/15 dark:text-foreground",
			)}
		>
			{children}
		</NavLink>
	);
}
