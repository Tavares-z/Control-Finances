export const dashboardWidgetListStyles = {
	row: "flex min-h-[3.25rem] items-center justify-between gap-2 py-1.5 transition-all duration-300",
	main: "flex min-w-0 flex-1 items-center gap-2",
	textStack: "min-w-0 flex-1 space-y-0.5",
	title: "truncate text-sm font-medium leading-5 text-foreground",
	titleLink:
		"inline-flex max-w-full items-center gap-1 text-sm font-medium leading-5 text-foreground underline-offset-2 hover:text-primary hover:underline",
	meta: "flex min-h-4 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4 text-muted-foreground",
	rank: "w-3 shrink-0 text-left text-xs font-medium leading-4 text-muted-foreground",
	trailing:
		"flex min-w-[5.75rem] shrink-0 flex-col items-end gap-0.5 text-right",
	trailingValue: "font-medium leading-5",
	trailingMeta: "flex h-5 items-center gap-0.5 text-xs font-medium leading-4",
	actionButton: "-mr-1 h-5 px-1 py-0 text-xs leading-4",
};
