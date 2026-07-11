import type { InvoicePaymentStatus } from "@/shared/lib/invoices";

export type Card = {
	id: string;
	name: string;
	brand: string;
	status: string;
	closingDay: string;
	dueDay: string;
	note: string | null;
	logo: string | null;
	limit: number;
	accountId: string;
	accountName: string;
	limitInUse: number;
	limitAvailable: number;
	currentInvoiceAmount: number;
	currentInvoiceLabel: string;
	currentInvoiceStatus: InvoicePaymentStatus | null;
};

export type CardFormValues = {
	name: string;
	brand: string;
	status: string;
	closingDay: string;
	dueDay: string;
	limit: string;
	note: string;
	logo: string;
	accountId: string;
};
