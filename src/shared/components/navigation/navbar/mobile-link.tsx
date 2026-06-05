"use client";

import { RiBankCard2Line, RiBankLine } from "@remixicon/react";
import { usePathname } from "next/navigation";
import { Badge } from "@/shared/components/ui/badge";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";
import type { NavbarEntityLink, NavbarFinanceLinks } from "./nav-items";
import { NavLink } from "./nav-link";

type MobileLinkProps = {
	href: string;
	icon: React.ReactNode;
	children: React.ReactNode;
	onClick?: () => void;
	badge?: number;
	preservePeriod?: boolean;
	description?: string;
};

export function MobileLink({
	href,
	icon,
	children,
	onClick,
	badge,
	preservePeriod,
	description,
}: MobileLinkProps) {
	const pathname = usePathname();

	const isActive =
		href === "/dashboard"
			? pathname === href
			: pathname === href || pathname.startsWith(`${href}/`);

	return (
		<NavLink
			href={href}
			preservePeriod={preservePeriod}
			onClick={onClick}
			className={cn(
				"flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
				"text-muted-foreground hover:text-foreground hover:bg-accent",
				isActive && "bg-primary/10 text-primary font-medium",
			)}
		>
			<span
				className={cn(
					"shrink-0",
					isActive ? "text-primary" : "text-muted-foreground",
				)}
			>
				{icon}
			</span>
			<span className="flex-1 flex flex-col gap-0.5">
				<span>{children}</span>
				{description && (
					<span className="text-xs text-muted-foreground leading-snug">
						{description}
					</span>
				)}
			</span>
			{badge && badge > 0 ? (
				<Badge variant="secondary" className="text-xs px-1.5 py-0">
					{badge}
				</Badge>
			) : null}
		</NavLink>
	);
}

export function MobileSectionLabel({ label }: { label: string }) {
	return (
		<p className="mt-3 mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
			{label}
		</p>
	);
}

export function MobileFinanceEntityLinks({
	type,
	items,
	onClick,
}: {
	type: keyof NavbarFinanceLinks;
	items: NavbarEntityLink[];
	onClick: () => void;
}) {
	const pathname = usePathname();

	return items.map((item) => {
		const href =
			type === "cards"
				? `/cards/${item.id}/invoice`
				: `/accounts/${item.id}/statement`;
		const logoSrc = resolveLogoSrc(item.logo);
		const isActive = pathname === href;
		const fallbackIcon =
			type === "cards" ? (
				<RiBankCard2Line className="size-3.5" />
			) : (
				<RiBankLine className="size-3.5" />
			);

		return (
			<NavLink
				key={href}
				href={href}
				preservePeriod
				onClick={onClick}
				className={cn(
					"flex items-center gap-2 rounded-md py-1.5 pr-3 pl-9 text-xs transition-colors",
					isActive
						? "bg-primary/10 text-primary font-medium"
						: "text-muted-foreground hover:bg-accent hover:text-foreground",
				)}
			>
				{logoSrc ? (
					<img
						src={logoSrc}
						alt=""
						className="size-3.5 shrink-0 rounded-full object-contain"
					/>
				) : (
					<span className="shrink-0">{fallbackIcon}</span>
				)}
				<span className="flex min-w-0 flex-col">
					<span className={cn("truncate", type === "cards" && "font-semibold")}>
						{item.name}
					</span>
					<span className="truncate text-xs text-muted-foreground">
						{type === "cards" ? "Fatura deste mês" : "Saldo"}:{" "}
						{formatCurrency(item.amount)}
					</span>
				</span>
			</NavLink>
		);
	});
}
