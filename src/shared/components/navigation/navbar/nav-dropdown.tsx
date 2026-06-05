"use client";

import {
	RiArrowRightSLine,
	RiBankCard2Line,
	RiBankLine,
} from "@remixicon/react";
import { usePathname } from "next/navigation";
import { Badge } from "@/shared/components/ui/badge";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";
import type {
	NavbarEntityLink,
	NavbarFinanceLinks,
	NavItem,
} from "./nav-items";
import { NavLink } from "./nav-link";

type NavDropdownProps = {
	items: NavItem[];
	financeLinks?: NavbarFinanceLinks;
};

function FinanceEntityLinks({
	type,
	items,
}: {
	type: keyof NavbarFinanceLinks;
	items: NavbarEntityLink[];
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
				<RiBankCard2Line className="size-5" />
			) : (
				<RiBankLine className="size-5" />
			);

		return (
			<li key={href}>
				<NavLink
					href={href}
					preservePeriod
					className={cn(
						"flex items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors",
						isActive
							? "bg-accent text-primary"
							: "text-foreground hover:bg-accent hover:text-foreground",
					)}
				>
					{logoSrc ? (
						<img
							src={logoSrc}
							alt=""
							className="size-5 shrink-0 rounded-full object-contain"
						/>
					) : (
						<span className="shrink-0">{fallbackIcon}</span>
					)}
					<span className="flex min-w-0 flex-col">
						<span className={cn("truncate font-semibold")}>{item.name}</span>
						<span className="truncate text-xs text-muted-foreground">
							{type === "cards" ? "Fatura deste mês" : "Saldo"}:{" "}
							{formatCurrency(item.amount)}
						</span>
					</span>
				</NavLink>
			</li>
		);
	});
}

export function NavDropdown({ items, financeLinks }: NavDropdownProps) {
	const pathname = usePathname();

	return (
		<ul className="grid w-72 gap-0.5 p-2">
			{items.map((item) => {
				const isActive =
					pathname === item.href || pathname.startsWith(`${item.href}/`);
				const entityLinks =
					item.href === "/cards"
						? financeLinks?.cards
						: item.href === "/accounts"
							? financeLinks?.accounts
							: undefined;
				const entityType =
					item.href === "/cards"
						? "cards"
						: item.href === "/accounts"
							? "accounts"
							: undefined;
				const hasEntityLinks = Boolean(entityType && entityLinks?.length);

				return (
					<li key={item.href} className="group/entity relative">
						<NavLink
							href={item.href}
							preservePeriod={item.preservePeriod}
							className={cn(
								"flex items-center gap-3 rounded-sm px-2 py-3 text-sm transition-colors",
								isActive
									? "border-primary bg-accent text-foreground"
									: "border-transparent text-foreground hover:bg-accent",
							)}
						>
							<span
								className={cn(
									"shrink-0",
									isActive
										? (item.iconClass ?? "text-foreground")
										: (item.iconClass ?? "text-muted-foreground"),
								)}
							>
								{item.icon}
							</span>
							<span className="flex flex-col min-w-0">
								<span className="font-semibold">{item.label}</span>
								{item.description && (
									<span className="text-xs text-muted-foreground truncate lowercase">
										{item.description}
									</span>
								)}
							</span>
							{item.badge && item.badge > 0 ? (
								<Badge
									variant="secondary"
									className="text-xs px-1.5 py-0 h-4 min-w-4 ml-auto shrink-0"
								>
									{item.badge}
								</Badge>
							) : null}
							{hasEntityLinks ? (
								<RiArrowRightSLine
									className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover/entity:translate-x-0.5"
									aria-hidden
								/>
							) : null}
						</NavLink>
						{hasEntityLinks && entityType && entityLinks ? (
							<div className="invisible absolute top-0 left-full z-50 pl-1 opacity-0 transition-opacity group-hover/entity:visible group-hover/entity:opacity-100 group-focus-within/entity:visible group-focus-within/entity:opacity-100">
								<ul className="grid max-h-[calc(100vh-5rem)] w-64 gap-0.5 overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground">
									<FinanceEntityLinks type={entityType} items={entityLinks} />
								</ul>
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
