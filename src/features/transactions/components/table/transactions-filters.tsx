"use client";

import {
	RiCheckLine,
	RiCloseLine,
	RiExpandUpDownLine,
	RiFilterLine,
} from "@remixicon/react";
import {
	type ReadonlyURLSearchParams,
	usePathname,
	useRouter,
	useSearchParams,
} from "next/navigation";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";
import {
	AMOUNT_MAX_PARAM,
	AMOUNT_MIN_PARAM,
	PAYMENT_METHODS,
	SETTLED_FILTER_VALUES,
	TRANSACTION_CONDITIONS,
	TRANSACTION_TYPES,
} from "@/features/transactions/lib/constants";
import { parsePositiveAmount } from "@/features/transactions/lib/page-helpers";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/shared/components/ui/command";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/shared/components/ui/drawer";
import { Input } from "@/shared/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { slugify } from "@/shared/utils/string";
import { cn } from "@/shared/utils/ui";
import {
	AccountCardSelectContent,
	CategorySelectContent,
	ConditionSelectContent,
	PayerSelectContent,
	PaymentMethodSelectContent,
	TransactionTypeSelectContent,
} from "../select-items";
import type {
	AccountCardFilterOption,
	TransactionFilterOption,
} from "../types";

const FILTER_EMPTY_VALUE = "__all";

const normalizeAmountParam = (raw: string): string | null => {
	const parsed = parsePositiveAmount(raw.trim());
	return parsed === null ? null : parsed.toString();
};

function useDebouncedAmountFilter(
	param: string,
	searchParams: URLSearchParams | ReadonlyURLSearchParams,
	onChange: (key: string, value: string | null) => void,
): [string, (value: string) => void] {
	const current = searchParams.get(param) ?? "";
	const [value, setValue] = useState(current);

	useEffect(() => {
		setValue(current);
	}, [current]);

	useEffect(() => {
		if (value === current) return;
		const timeout = setTimeout(() => {
			const normalized = normalizeAmountParam(value);
			if ((normalized ?? "") === current) return;
			onChange(param, normalized);
		}, 400);
		return () => clearTimeout(timeout);
	}, [value, current, param, onChange]);

	return [value, setValue];
}

interface FilterSelectProps {
	param: string;
	placeholder: string;
	options: { value: string; label: string }[];
	widthClass?: string;
	disabled?: boolean;
	getParamValue: (key: string) => string;
	onChange: (key: string, value: string | null) => void;
	renderContent?: (label: string) => ReactNode;
}

function FilterSelect({
	param,
	placeholder,
	options,
	widthClass = "w-[130px]",
	disabled,
	getParamValue,
	onChange,
	renderContent,
}: FilterSelectProps) {
	const value = getParamValue(param);
	const current = options.find((option) => option.value === value);
	const displayLabel =
		value === FILTER_EMPTY_VALUE
			? placeholder
			: (current?.label ?? placeholder);

	return (
		<Select
			value={value}
			onValueChange={(nextValue) =>
				onChange(param, nextValue === FILTER_EMPTY_VALUE ? null : nextValue)
			}
			disabled={disabled}
		>
			<SelectTrigger
				className={cn("text-sm border-dashed", widthClass)}
				disabled={disabled}
			>
				<span className="truncate">
					{value !== FILTER_EMPTY_VALUE && current && renderContent
						? renderContent(current.label)
						: displayLabel}
				</span>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={FILTER_EMPTY_VALUE}>Todos</SelectItem>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{renderContent ? renderContent(option.label) : option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

type MultiOption = {
	value: string;
	label: string;
	group?: string;
	render?: ReactNode;
};

interface MultiSelectFilterProps {
	placeholder: string;
	options: MultiOption[];
	selected: string[];
	onChange: (values: string[]) => void;
	widthClass?: string;
	disabled?: boolean;
	searchable?: boolean;
	searchPlaceholder?: string;
	groupOrder?: string[];
}

function MultiSelectFilter({
	placeholder,
	options,
	selected,
	onChange,
	widthClass = "w-full",
	disabled,
	searchable = false,
	searchPlaceholder = "Buscar...",
	groupOrder,
}: MultiSelectFilterProps) {
	const [open, setOpen] = useState(false);

	const groupedOptions = useMemo(() => {
		const map = new Map<string, MultiOption[]>();
		for (const option of options) {
			const key = option.group ?? "";
			const list = map.get(key) ?? [];
			list.push(option);
			map.set(key, list);
		}
		const orderedKeys = groupOrder
			? [
					...groupOrder,
					...Array.from(map.keys()).filter((k) => !groupOrder.includes(k)),
				]
			: Array.from(map.keys());
		return orderedKeys
			.filter((key) => map.has(key))
			.map((key) => ({ name: key, items: map.get(key) ?? [] }));
	}, [options, groupOrder]);

	const selectedSet = new Set(selected);
	const selectedOptions = options.filter((option) =>
		selectedSet.has(option.value),
	);

	const toggle = (value: string) => {
		if (selectedSet.has(value)) {
			onChange(selected.filter((v) => v !== value));
		} else {
			onChange([...selected, value]);
		}
	};

	const clear = () => {
		onChange([]);
	};

	const triggerLabel: ReactNode =
		selectedOptions.length === 0 ? (
			placeholder
		) : selectedOptions.length === 1 ? (
			(selectedOptions[0]?.render ?? selectedOptions[0]?.label)
		) : (
			<span className="flex items-center gap-1.5">
				<span className="text-foreground">
					{selectedOptions.length} selecionados
				</span>
			</span>
		);

	return (
		<Popover open={open} onOpenChange={setOpen} modal>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className={cn(
						"justify-between text-sm border-dashed font-normal",
						widthClass,
					)}
					disabled={disabled}
				>
					<span className="truncate flex items-center gap-2">
						{triggerLabel}
					</span>
					<RiExpandUpDownLine className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[260px] p-0">
				<Command>
					{searchable ? <CommandInput placeholder={searchPlaceholder} /> : null}
					<CommandList>
						<CommandEmpty>Nada encontrado.</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value="__clear"
								onSelect={() => clear()}
								disabled={selectedOptions.length === 0}
								className="text-muted-foreground data-[disabled=true]:opacity-50 data-[disabled=true]:pointer-events-none"
							>
								Limpar seleção
							</CommandItem>
						</CommandGroup>
						{groupedOptions.map((group) => (
							<CommandGroup
								key={group.name || "default"}
								heading={group.name || undefined}
							>
								{group.items.map((option) => {
									const isSelected = selectedSet.has(option.value);
									return (
										<CommandItem
											key={option.value}
											value={`${option.value} ${option.label}`}
											onSelect={() => toggle(option.value)}
											className="gap-2"
										>
											<Checkbox
												checked={isSelected}
												className="pointer-events-none"
												aria-hidden
											/>
											<span className="flex items-center gap-2 flex-1 min-w-0 truncate">
												{option.render ?? option.label}
											</span>
											{isSelected ? (
												<RiCheckLine className="ml-auto size-4 shrink-0" />
											) : null}
										</CommandItem>
									);
								})}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

interface TransactionsFiltersProps {
	payerOptions: TransactionFilterOption[];
	categoryOptions: TransactionFilterOption[];
	accountCardOptions: AccountCardFilterOption[];
	className?: string;
	exportButton?: ReactNode;
	hideAdvancedFilters?: boolean;
}

export function TransactionsFilters({
	payerOptions,
	categoryOptions,
	accountCardOptions,
	className,
	exportButton,
	hideAdvancedFilters = false,
}: TransactionsFiltersProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const getParamValue = (key: string) =>
		searchParams.get(key) ?? FILTER_EMPTY_VALUE;

	const getParamValues = useCallback(
		(key: string) => searchParams.getAll(key),
		[searchParams],
	);

	const handleFilterChange = useCallback(
		(key: string, value: string | null) => {
			const nextParams = new URLSearchParams(searchParams.toString());

			if (value && value !== FILTER_EMPTY_VALUE) {
				nextParams.set(key, value);
			} else {
				nextParams.delete(key);
			}

			nextParams.delete("page");

			startTransition(() => {
				const target = nextParams.toString()
					? `${pathname}?${nextParams.toString()}`
					: pathname;
				router.replace(target, { scroll: false });
			});
		},
		[searchParams, pathname, router],
	);

	const handleMultiFilterChange = useCallback(
		(key: string, values: string[]) => {
			const nextParams = new URLSearchParams(searchParams.toString());
			nextParams.delete(key);
			for (const value of values) {
				if (value) {
					nextParams.append(key, value);
				}
			}
			nextParams.delete("page");

			startTransition(() => {
				const target = nextParams.toString()
					? `${pathname}?${nextParams.toString()}`
					: pathname;
				router.replace(target, { scroll: false });
				router.refresh();
			});
		},
		[searchParams, pathname, router],
	);

	const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
	const currentSearchParam = searchParams.get("q") ?? "";

	useEffect(() => {
		setSearchValue(currentSearchParam);
	}, [currentSearchParam]);

	useEffect(() => {
		if (searchValue === currentSearchParam) {
			return;
		}

		const timeout = setTimeout(() => {
			const normalized = searchValue.trim();
			handleFilterChange("q", normalized.length > 0 ? normalized : null);
		}, 350);

		return () => clearTimeout(timeout);
	}, [searchValue, currentSearchParam, handleFilterChange]);

	const [valorMinValue, setValorMinValue] = useDebouncedAmountFilter(
		AMOUNT_MIN_PARAM,
		searchParams,
		handleFilterChange,
	);
	const [valorMaxValue, setValorMaxValue] = useDebouncedAmountFilter(
		AMOUNT_MAX_PARAM,
		searchParams,
		handleFilterChange,
	);

	const handleReset = () => {
		const periodValue = searchParams.get("periodo");
		const pageSizeValue = searchParams.get("pageSize");
		const nextParams = new URLSearchParams();
		if (periodValue) {
			nextParams.set("periodo", periodValue);
		}
		if (pageSizeValue) {
			nextParams.set("pageSize", pageSizeValue);
		}
		setSearchValue("");
		setValorMinValue("");
		setValorMaxValue("");
		startTransition(() => {
			const target = nextParams.toString()
				? `${pathname}?${nextParams.toString()}`
				: pathname;
			router.replace(target, { scroll: false });
		});
	};

	const conditionOptions = useMemo<MultiOption[]>(
		() =>
			TRANSACTION_CONDITIONS.map((value) => ({
				value: slugify(value),
				label: value,
				render: <ConditionSelectContent label={value} />,
			})),
		[],
	);

	const paymentOptions = useMemo<MultiOption[]>(
		() =>
			PAYMENT_METHODS.map((value) => ({
				value: slugify(value),
				label: value,
				render: <PaymentMethodSelectContent label={value} />,
			})),
		[],
	);

	const payerMultiOptions = useMemo<MultiOption[]>(
		() =>
			payerOptions.map((option) => ({
				value: option.slug,
				label: option.label,
				render: (
					<PayerSelectContent
						label={option.label}
						avatarUrl={option.avatarUrl}
					/>
				),
			})),
		[payerOptions],
	);

	const categoryMultiOptions = useMemo<MultiOption[]>(
		() =>
			categoryOptions.map((option) => ({
				value: option.slug,
				label: option.label,
				render: (
					<CategorySelectContent label={option.label} icon={option.icon} />
				),
			})),
		[categoryOptions],
	);

	const accountCardMultiOptions = useMemo<MultiOption[]>(
		() =>
			accountCardOptions.map((option) => ({
				value: option.slug,
				label: option.label,
				group: option.kind === "cartao" ? "Cartões" : "Contas",
				render: (
					<AccountCardSelectContent
						label={option.label}
						logo={option.logo}
						isCartao={option.kind === "cartao"}
					/>
				),
			})),
		[accountCardOptions],
	);

	const [drawerOpen, setDrawerOpen] = useState(false);

	const hasActiveFilters =
		searchParams.get("type") ||
		searchParams.getAll("condition").length > 0 ||
		searchParams.getAll("payment").length > 0 ||
		searchParams.getAll("payer").length > 0 ||
		searchParams.getAll("category").length > 0 ||
		searchParams.getAll("accountCard").length > 0 ||
		searchParams.get("settled") ||
		searchParams.get("hasAttachment") ||
		searchParams.get("isDivided") ||
		searchParams.get(AMOUNT_MIN_PARAM) ||
		searchParams.get(AMOUNT_MAX_PARAM);

	const handleResetFilters = () => {
		handleReset();
		setDrawerOpen(false);
	};

	return (
		<div
			className={cn(
				"flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center",
				className,
			)}
		>
			<div className="relative w-full md:w-[250px]">
				<Input
					value={searchValue}
					onChange={(event) => setSearchValue(event.target.value)}
					placeholder="Buscar"
					aria-label="Buscar lançamentos"
					className={cn(
						"w-full text-sm border-dashed",
						searchValue.length > 0 && "pr-8",
					)}
				/>
				{searchValue.length > 0 ? (
					<button
						type="button"
						onClick={() => setSearchValue("")}
						aria-label="Limpar busca"
						className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<RiCloseLine className="size-4" />
					</button>
				) : null}
			</div>

			<div className="flex w-full gap-2 md:w-auto">
				{exportButton && (
					<div className="flex-1 md:flex-none *:w-full *:md:w-auto">
						{exportButton}
					</div>
				)}

				{!hideAdvancedFilters && (
					<Drawer
						direction="right"
						open={drawerOpen}
						onOpenChange={setDrawerOpen}
					>
						<DrawerTrigger asChild>
							<Button
								variant="outline"
								className="flex-1 md:flex-none text-sm border-dashed relative bg-transparent"
								aria-label="Abrir filtros"
							>
								<RiFilterLine className="size-4" />
								Filtros
								{hasActiveFilters && (
									<span className="absolute -top-1 -right-1 size-3 rounded-full bg-primary" />
								)}
							</Button>
						</DrawerTrigger>
						{hasActiveFilters && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleReset}
								disabled={isPending}
								aria-label="Limpar filtros"
								className="text-xs text-muted-foreground hover:text-foreground h-9 px-2"
							>
								<RiCloseLine className="size-3.5" />
								Limpar
							</Button>
						)}
						<DrawerContent>
							<DrawerHeader>
								<DrawerTitle>Filtros</DrawerTitle>
								<DrawerDescription>
									Selecione os filtros desejados para refinar os lançamentos
								</DrawerDescription>
							</DrawerHeader>

							<div className="flex-1 overflow-y-auto px-4 space-y-4">
								<div className="space-y-2">
									<label className="text-sm font-medium">
										Tipo de Lançamento
									</label>
									<FilterSelect
										param="type"
										placeholder="Todos"
										options={TRANSACTION_TYPES.map((v) => ({
											value: slugify(v),
											label: v,
										}))}
										widthClass="w-full border-dashed"
										disabled={isPending}
										getParamValue={getParamValue}
										onChange={handleFilterChange}
										renderContent={(label) => (
											<TransactionTypeSelectContent label={label} />
										)}
									/>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">
										Condição de Lançamento
									</label>
									<MultiSelectFilter
										placeholder="Todas"
										options={conditionOptions}
										selected={getParamValues("condition")}
										onChange={(values) =>
											handleMultiFilterChange("condition", values)
										}
										disabled={isPending}
									/>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">
										Forma de Pagamento
									</label>
									<MultiSelectFilter
										placeholder="Todas"
										options={paymentOptions}
										selected={getParamValues("payment")}
										onChange={(values) =>
											handleMultiFilterChange("payment", values)
										}
										disabled={isPending}
									/>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">Pessoa</label>
									<MultiSelectFilter
										placeholder="Todas"
										options={payerMultiOptions}
										selected={getParamValues("payer")}
										onChange={(values) =>
											handleMultiFilterChange("payer", values)
										}
										disabled={isPending}
										searchable
										searchPlaceholder="Buscar pessoa..."
									/>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">Categoria</label>
									<MultiSelectFilter
										placeholder="Todas"
										options={categoryMultiOptions}
										selected={getParamValues("category")}
										onChange={(values) =>
											handleMultiFilterChange("category", values)
										}
										disabled={isPending}
										searchable
										searchPlaceholder="Buscar categoria..."
									/>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">Conta/Cartão</label>
									<MultiSelectFilter
										placeholder="Todos"
										options={accountCardMultiOptions}
										selected={getParamValues("accountCard")}
										onChange={(values) =>
											handleMultiFilterChange("accountCard", values)
										}
										disabled={isPending}
										searchable
										searchPlaceholder="Buscar conta ou cartão..."
										groupOrder={["Contas", "Cartões"]}
									/>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">Faixa de valor</label>
									<div className="flex items-center gap-2">
										<Input
											type="number"
											inputMode="decimal"
											min="0"
											step="0.01"
											placeholder="Mínimo"
											aria-label="Valor mínimo"
											value={valorMinValue}
											onChange={(event) => setValorMinValue(event.target.value)}
											disabled={isPending}
											className="text-sm border-dashed"
										/>
										<span className="text-xs text-muted-foreground">até</span>
										<Input
											type="number"
											inputMode="decimal"
											min="0"
											step="0.01"
											placeholder="Máximo"
											aria-label="Valor máximo"
											value={valorMaxValue}
											onChange={(event) => setValorMaxValue(event.target.value)}
											disabled={isPending}
											className="text-sm border-dashed"
										/>
									</div>
								</div>

								<div className="space-y-3">
									<p className="text-sm font-medium">Status</p>
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<label
												htmlFor="filter-pago"
												className="text-sm text-muted-foreground cursor-pointer"
											>
												Somente pagos
											</label>
											<Switch
												id="filter-pago"
												checked={
													searchParams.get("settled") ===
													SETTLED_FILTER_VALUES.PAID
												}
												disabled={isPending}
												onCheckedChange={(checked) => {
													handleFilterChange(
														"settled",
														checked ? SETTLED_FILTER_VALUES.PAID : null,
													);
												}}
											/>
										</div>
										<div className="flex items-center justify-between">
											<label
												htmlFor="filter-nao-pago"
												className="text-sm text-muted-foreground cursor-pointer"
											>
												Somente não pagos
											</label>
											<Switch
												id="filter-nao-pago"
												checked={
													searchParams.get("settled") ===
													SETTLED_FILTER_VALUES.UNPAID
												}
												disabled={isPending}
												onCheckedChange={(checked) => {
													handleFilterChange(
														"settled",
														checked ? SETTLED_FILTER_VALUES.UNPAID : null,
													);
												}}
											/>
										</div>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<label
										htmlFor="filter-has-attachment"
										className="text-sm font-medium cursor-pointer"
									>
										Com anexo
									</label>
									<Switch
										id="filter-has-attachment"
										checked={searchParams.get("hasAttachment") === "true"}
										disabled={isPending}
										onCheckedChange={(checked) => {
											handleFilterChange(
												"hasAttachment",
												checked ? "true" : null,
											);
										}}
									/>
								</div>

								<div className="flex items-center justify-between">
									<label
										htmlFor="filter-is-divided"
										className="text-sm font-medium cursor-pointer"
									>
										Somente divididos
									</label>
									<Switch
										id="filter-is-divided"
										checked={searchParams.get("isDivided") === "true"}
										disabled={isPending}
										onCheckedChange={(checked) => {
											handleFilterChange("isDivided", checked ? "true" : null);
										}}
									/>
								</div>
							</div>

							<DrawerFooter>
								<Button
									type="button"
									variant="outline"
									onClick={handleResetFilters}
									disabled={isPending || !hasActiveFilters}
								>
									Limpar filtros
								</Button>
							</DrawerFooter>
						</DrawerContent>
					</Drawer>
				)}
			</div>
		</div>
	);
}
