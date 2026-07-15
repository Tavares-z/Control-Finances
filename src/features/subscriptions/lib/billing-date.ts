/**
 * Resolves the billing date for a given year/month, clamping the day to the
 * last day of that month (e.g. billingDay=31 in February → Feb 28/29).
 */
export function getBillingDateForMonth(
	year: number,
	month: number,
	billingDay: number,
): Date {
	const lastDay = new Date(year, month + 1, 0).getDate();
	return new Date(year, month, Math.min(billingDay, lastDay));
}

export function toPeriodKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Computes the current cycle's billing date for a subscription, given
 * `billingDay` and a reference date (defaults to today).
 */
export function getCurrentCycleBillingDate(
	billingDay: number,
	referenceDate: Date = new Date(),
): Date {
	return getBillingDateForMonth(
		referenceDate.getFullYear(),
		referenceDate.getMonth(),
		billingDay,
	);
}

/**
 * Computes upcoming billing dates strictly after `referenceDate`, up to
 * `withinDays` days ahead. Subscriptions only support monthly cadence, so
 * this walks month by month from the reference date's cycle.
 */
export function getUpcomingBillingDates(
	billingDay: number,
	referenceDate: Date,
	withinDays: number,
): Date[] {
	const horizon = new Date(referenceDate);
	horizon.setDate(horizon.getDate() + withinDays);

	const results: Date[] = [];
	let cursorYear = referenceDate.getFullYear();
	let cursorMonth = referenceDate.getMonth();

	// A few months of iteration comfortably covers any withinDays window
	// used in practice (billing is monthly, so ~withinDays/28 + 1 cycles).
	const maxIterations = Math.ceil(withinDays / 28) + 2;

	for (let i = 0; i < maxIterations; i++) {
		const candidate = getBillingDateForMonth(
			cursorYear,
			cursorMonth,
			billingDay,
		);
		if (candidate > referenceDate && candidate <= horizon) {
			results.push(candidate);
		}
		if (candidate > horizon) break;

		cursorMonth += 1;
		if (cursorMonth > 11) {
			cursorMonth = 0;
			cursorYear += 1;
		}
	}

	return results;
}
