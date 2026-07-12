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
