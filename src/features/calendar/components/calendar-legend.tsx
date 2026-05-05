"use client";

import { EVENT_TYPE_STYLES } from "@/features/calendar/components/day-cell";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/ui";

const LEGEND_ITEMS = [
	{ label: "Lançamentos", ...EVENT_TYPE_STYLES.transaction },
	{ label: "Parcelas", ...EVENT_TYPE_STYLES.installment },
	{ label: "Boletos", ...EVENT_TYPE_STYLES.boleto },
	{ label: "Fatura de Cartão", ...EVENT_TYPE_STYLES.card },
];

export function CalendarLegend() {
	return (
		<Card className="px-4 py-2">
			<ul className="flex flex-row items-center gap-2">
				{LEGEND_ITEMS.map((item) => (
					<li
						key={item.label}
						className={cn(
							"flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
							item.wrapper,
						)}
					>
						<span
							className={cn("size-1.5 shrink-0 rounded-full", item.dot)}
							aria-hidden
						/>
						{item.label}
					</li>
				))}
			</ul>
		</Card>
	);
}
