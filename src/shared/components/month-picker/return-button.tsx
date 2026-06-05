"use client";

import { RiCalendarLine } from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";

interface ReturnButtonProps {
	disabled?: boolean;
	onClick: () => void;
}

export default function ReturnButton({ disabled, onClick }: ReturnButtonProps) {
	return (
		<Button
			type="button"
			variant="secondary"
			className="w-max shrink-0"
			size="sm"
			disabled={disabled}
			onClick={onClick}
			aria-label="Retornar para o mês atual"
		>
			<RiCalendarLine className="size-4" />
			<span className="hidden sm:inline">Mês atual</span>
		</Button>
	);
}
