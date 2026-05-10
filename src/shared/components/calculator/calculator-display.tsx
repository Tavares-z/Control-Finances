import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";

type CalculatorDisplayProps = {
	history: string | null;
	expression: string;
	resultText: string | null;
	copied: boolean;
	onCopy: () => void;
	isResultView: boolean;
};

const getExpressionSizeClass = (length: number, compact: boolean) => {
	if (compact) {
		if (length <= 14) return "text-2xl";
		if (length <= 20) return "text-xl";
		if (length <= 28) return "text-base";
		return "text-sm";
	}
	if (length <= 12) return "text-3xl";
	if (length <= 18) return "text-2xl";
	if (length <= 24) return "text-xl";
	if (length <= 32) return "text-base";
	return "text-sm";
};

export function CalculatorDisplay({
	history,
	expression,
	resultText,
	copied,
	onCopy,
	isResultView,
}: CalculatorDisplayProps) {
	const sizeClass = getExpressionSizeClass(expression.length, isResultView);

	return (
		<div className="flex h-24 min-w-0 flex-col rounded-xl border bg-muted px-4 py-4 text-right">
			<div className="min-h-5 truncate text-sm text-muted-foreground">
				{history ?? (
					<span
						className="pointer-events-none opacity-0 select-none"
						aria-hidden
					>
						0 + 0
					</span>
				)}
			</div>
			<div className="mt-auto flex min-w-0 items-end justify-end gap-2">
				<div
					className={cn(
						"min-w-0 flex-1 truncate text-right font-semibold transition-all",
						sizeClass,
					)}
				>
					{expression}
				</div>
				{resultText && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onCopy}
						className="h-6 w-6 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground"
					>
						{copied ? (
							<RiCheckLine className="h-4 w-4" />
						) : (
							<RiFileCopyLine className="h-4 w-4" />
						)}
						<span className="sr-only">
							{copied ? "Resultado copiado" : "Copiar resultado"}
						</span>
					</Button>
				)}
			</div>
		</div>
	);
}
