import { and, desc, eq, ne, not, or, sql } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import {
	INITIAL_BALANCE_NOTE,
	REFUND_NOTE_PREFIX,
} from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { getBusinessDateString, toDateOnlyString } from "@/shared/utils/date";
import { safeToNumber as toNumber } from "@/shared/utils/number";

/**
 * Tipo de conta que identifica um saldo de benefício (VR/VA).
 * Precisa bater exatamente com PAYMENT_METHODS/DEFAULT_ACCOUNT_TYPES.
 */
const VR_ACCOUNT_TYPE = "Pré-Pago | VR/VA";

/** Ciclo presumido quando ainda não há histórico suficiente para inferir. */
const DEFAULT_CYCLE_DAYS = 30;

/** Abaixo disso o ritmo diário é ruidoso demais para virar veredito. */
const MIN_DAYS_FOR_VERDICT = 3;

/** Quantas recargas passadas usamos para estimar a duração do ciclo. */
const RECHARGE_HISTORY_SIZE = 4;

export type VrPaceVerdict = "fecha" | "aperta" | "nao-fecha" | "impreciso";

export type VrBalanceSnapshot = {
	accountId: string;
	accountName: string;
	balance: number;
	/** Data da última recarga (receita) identificada, YYYY-MM-DD. */
	lastRechargeDate: string | null;
	lastRechargeAmount: number;
	/** Dias corridos desde a última recarga (inclui fim de semana). */
	daysElapsed: number;
	/** Duração estimada do ciclo, inferida do histórico de recargas. */
	estimatedCycleDays: number;
	/** Dias restantes até a próxima recarga (nunca negativo). */
	daysRemaining: number;
	/** Data-alvo da próxima recarga informada pelo usuário (YYYY-MM-DD), se houver. */
	nextRechargeDate: string | null;
	/**
	 * true quando `daysRemaining` veio da data informada pelo usuário (cravada),
	 * false quando foi inferida pela média dos intervalos entre recargas.
	 */
	nextRechargeIsManual: boolean;
	/** Total gasto no ciclo atual. */
	spentInCycle: number;
	/** Ritmo observado: gasto por dia corrido no ciclo atual. */
	dailyPace: number;
	/** Quanto dá para gastar por dia com o saldo restante. */
	dailyAllowance: number;
	/** Em quantos dias o saldo acaba mantendo o ritmo atual. */
	daysOfRunway: number | null;
	verdict: VrPaceVerdict;
	/** true quando o ciclo foi presumido por falta de histórico. */
	cycleIsEstimated: boolean;
};

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
	const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
	const to = Date.parse(`${toIsoDate}T00:00:00Z`);

	if (Number.isNaN(from) || Number.isNaN(to)) {
		return 0;
	}

	return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * Estima a duração do ciclo pela média dos intervalos entre recargas.
 * VR não cai em dia fixo, então um `diaDeRecarga` configurável mentiria;
 * a média observada acompanha a variação real sem exigir manutenção.
 */
function estimateCycleDays(rechargeDates: string[]): {
	cycleDays: number;
	isEstimated: boolean;
} {
	if (rechargeDates.length < 2) {
		return { cycleDays: DEFAULT_CYCLE_DAYS, isEstimated: true };
	}

	const intervals: number[] = [];
	for (let index = 0; index < rechargeDates.length - 1; index++) {
		const interval = daysBetween(
			rechargeDates[index + 1] as string,
			rechargeDates[index] as string,
		);
		if (interval > 0) {
			intervals.push(interval);
		}
	}

	if (intervals.length === 0) {
		return { cycleDays: DEFAULT_CYCLE_DAYS, isEstimated: true };
	}

	const average =
		intervals.reduce((total, interval) => total + interval, 0) /
		intervals.length;

	return { cycleDays: Math.round(average), isEstimated: false };
}

function resolveVerdict({
	daysElapsed,
	daysRemaining,
	daysOfRunway,
}: {
	daysElapsed: number;
	daysRemaining: number;
	daysOfRunway: number | null;
}): VrPaceVerdict {
	if (daysElapsed < MIN_DAYS_FOR_VERDICT) {
		return "impreciso";
	}

	// Sem gasto no ciclo o saldo dura indefinidamente.
	if (daysOfRunway === null) {
		return "fecha";
	}

	if (daysOfRunway >= daysRemaining) {
		return "fecha";
	}

	// Margem curta: o saldo cobre a maior parte do que falta, mas não tudo.
	if (daysOfRunway >= daysRemaining * 0.8) {
		return "aperta";
	}

	return "nao-fecha";
}

/**
 * Snapshot do saldo de benefício (VR/VA) e do ritmo de consumo do ciclo.
 *
 * Nota: contas de VR normalmente ficam com `excludeFromBalance = true` para não
 * poluir o patrimônio nem virar receita recorrente. Por isso este snapshot
 * deliberadamente NÃO aplica `excludeTransactionsFromExcludedAccounts()` — é o
 * único lugar em que queremos justamente a conta que o resto do dashboard
 * ignora. `fetchDashboardAccounts` já devolve todas as contas (a flag só afeta
 * o `totalBalance`), então reusamos o saldo dela em vez de recalcular.
 */
export async function fetchDashboardVrBalance(
	userId: string,
): Promise<VrBalanceSnapshot | null> {
	const { accounts } = await fetchDashboardAccounts(userId);
	const vrAccount = accounts.find(
		(account) => account.accountType === VR_ACCOUNT_TYPE,
	);

	if (!vrAccount) {
		return null;
	}

	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) {
		return null;
	}

	// Data-alvo opcional da próxima recarga. `fetchDashboardAccounts` não expõe
	// essa coluna (é VR-específica), então lemos direto aqui pela conta já
	// identificada. Quando presente e futura, ela crava `daysRemaining` no lugar
	// da estimativa por histórico.
	const [rechargeConfigRow] = await db
		.select({ nextRechargeDate: financialAccounts.nextRechargeDate })
		.from(financialAccounts)
		.where(
			and(
				eq(financialAccounts.id, vrAccount.id),
				eq(financialAccounts.userId, userId),
			),
		)
		.limit(1);

	const configuredNextRecharge = toDateOnlyString(
		rechargeConfigRow?.nextRechargeDate ?? null,
	);

	const scopeFilters = [
		eq(transactions.userId, userId),
		eq(transactions.accountId, vrAccount.id),
		eq(transactions.payerId, adminPayerId),
		eq(transactions.isSettled, true),
	];

	// Recarga = receita real da conta. Saldo inicial e estorno também entram
	// como positivos, mas não marcam início de ciclo — mesmo tratamento que
	// fetchAccountSummary aplica ao somar entradas.
	const rechargeRows = await db
		.select({
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
		})
		.from(transactions)
		.where(
			and(
				...scopeFilters,
				eq(transactions.transactionType, "Receita"),
				or(
					sql`${transactions.note} is null`,
					ne(transactions.note, INITIAL_BALANCE_NOTE),
				),
				or(
					sql`${transactions.note} is null`,
					not(sql`${transactions.note} ilike ${`${REFUND_NOTE_PREFIX}%`}`),
				),
			),
		)
		.orderBy(desc(transactions.purchaseDate))
		.limit(RECHARGE_HISTORY_SIZE);

	// purchaseDate vem como Date (schema usa mode: "date"); normalizamos para
	// YYYY-MM-DD antes de qualquer aritmética de dias.
	const rechargeDates = rechargeRows
		.map((row) => toDateOnlyString(row.purchaseDate))
		.filter((date): date is string => date !== null);

	const lastRechargeDate = rechargeDates[0] ?? null;
	const lastRechargeAmount = toNumber(rechargeRows[0]?.amount ?? 0);

	const today = getBusinessDateString();
	const { cycleDays, isEstimated } = estimateCycleDays(rechargeDates);

	// A data informada só vale se ainda não passou — recarga vencida não deixada
	// atualizar volta a ser ruído, então nesse caso caímos na estimativa.
	const manualDaysRemaining =
		configuredNextRecharge && configuredNextRecharge > today
			? daysBetween(today, configuredNextRecharge)
			: null;
	const nextRechargeIsManual = manualDaysRemaining !== null;

	// Sem recarga registrada não há ciclo: mostramos só o saldo. Mesmo assim, se o
	// usuário informou a data da próxima recarga, já dá para dizer quanto sobra por
	// dia até lá (o resto — ritmo/veredito — continua dependendo de histórico).
	if (!lastRechargeDate) {
		const remaining = manualDaysRemaining ?? cycleDays;
		return {
			accountId: vrAccount.id,
			accountName: vrAccount.name,
			balance: vrAccount.balance,
			lastRechargeDate: null,
			lastRechargeAmount: 0,
			daysElapsed: 0,
			estimatedCycleDays: cycleDays,
			daysRemaining: remaining,
			nextRechargeDate: configuredNextRecharge,
			nextRechargeIsManual,
			spentInCycle: 0,
			dailyPace: 0,
			dailyAllowance:
				remaining > 0 ? vrAccount.balance / remaining : vrAccount.balance,
			daysOfRunway: null,
			verdict: "impreciso",
			cycleIsEstimated: true,
		};
	}

	const [spentRow] = await db
		.select({
			total: sql<number>`
				coalesce(
					sum(
						case
							when ${transactions.transactionType} = 'Despesa'
								then abs(${transactions.amount})
							else 0
						end
					),
					0
				)
			`,
		})
		.from(transactions)
		.where(
			and(
				...scopeFilters,
				sql`${transactions.purchaseDate} >= ${lastRechargeDate}::date`,
			),
		);

	const spentInCycle = toNumber(spentRow?.total ?? 0);

	// Dia da recarga conta como dia 1 — evita divisão por zero e reflete que o
	// gasto do próprio dia já consome o ciclo.
	const daysElapsed = daysBetween(lastRechargeDate, today) + 1;
	// Data informada crava os dias restantes; sem ela, inferimos pelo ciclo.
	const daysRemaining =
		manualDaysRemaining ?? Math.max(0, cycleDays - (daysElapsed - 1));

	const dailyPace = spentInCycle / daysElapsed;
	const daysOfRunway = dailyPace > 0 ? vrAccount.balance / dailyPace : null;
	const dailyAllowance =
		daysRemaining > 0 ? vrAccount.balance / daysRemaining : vrAccount.balance;

	return {
		accountId: vrAccount.id,
		accountName: vrAccount.name,
		balance: vrAccount.balance,
		lastRechargeDate,
		lastRechargeAmount,
		daysElapsed,
		estimatedCycleDays: cycleDays,
		daysRemaining,
		nextRechargeDate: configuredNextRecharge,
		nextRechargeIsManual,
		spentInCycle,
		dailyPace,
		dailyAllowance,
		daysOfRunway,
		verdict: resolveVerdict({ daysElapsed, daysRemaining, daysOfRunway }),
		cycleIsEstimated: isEstimated,
	};
}
