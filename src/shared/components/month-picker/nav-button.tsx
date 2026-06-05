"use client";

import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";

interface NavigationButtonProps {
	direction: "left" | "right";
	disabled?: boolean;
	onClick: () => void;
}

export default function NavigationButton({
	direction,
	disabled,
	onClick,
}: NavigationButtonProps) {
	const Icon = direction === "left" ? RiArrowLeftSLine : RiArrowRightSLine;

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			onClick={onClick}
			disabled={disabled}
			aria-label={`Navegar para o mês ${
				direction === "left" ? "anterior" : "seguinte"
			}`}
		>
			<Icon className="size-5 text-primary" />
		</Button>
	);
}
