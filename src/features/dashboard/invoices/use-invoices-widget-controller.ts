"use client";

import { useEffect, useRef, useState } from "react";
import {
	getCurrentDateString,
	type InvoiceDialogState,
	isInvoicePaid,
	markInvoiceAsPaid,
} from "@/features/dashboard/invoices/invoices-helpers";
import type { DashboardInvoice } from "@/features/dashboard/invoices/invoices-queries";
import {
	type PaymentDialogController,
	usePaymentDialogController,
} from "@/features/dashboard/payments/use-payment-dialog-controller";
import { updateInvoicePaymentStatusAction } from "@/features/invoices/actions";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";

type InvoicesWidgetController = Omit<
	PaymentDialogController<DashboardInvoice>,
	"selectedItem"
> & {
	selectedInvoice: DashboardInvoice | null;
	modalState: InvoiceDialogState;
	paymentAccountId: string;
	setPaymentAccountId: (accountId: string) => void;
	paymentDate: Date;
	setPaymentDate: (date: Date) => void;
};

export function useInvoicesWidgetController(
	invoices: DashboardInvoice[],
): InvoicesWidgetController {
	const [paymentAccountId, setPaymentAccountId] = useState<string>("");
	const [paymentDate, setPaymentDate] = useState<Date>(() => new Date());

	const paymentAccountIdRef = useRef(paymentAccountId);
	const paymentDateRef = useRef(paymentDate);
	paymentAccountIdRef.current = paymentAccountId;
	paymentDateRef.current = paymentDate;

	const controller = usePaymentDialogController({
		items: invoices,
		getItemId: (invoice) => invoice.id,
		isItemConfirmed: (invoice) => isInvoicePaid(invoice.paymentStatus),
		executeConfirm: (invoice) => {
			const accountId = paymentAccountIdRef.current || undefined;
			const date = paymentDateRef.current;
			const isoDate = date.toISOString().split("T")[0];

			return updateInvoicePaymentStatusAction({
				cardId: invoice.cardId,
				period: invoice.period,
				status: INVOICE_PAYMENT_STATUS.PAID,
				paymentAccountId: accountId,
				paymentDate: isoDate,
			});
		},
		applyConfirmedState: (invoice) =>
			markInvoiceAsPaid(invoice, getCurrentDateString()),
	});

	const selectedInvoiceId = controller.selectedItem?.id ?? null;
	const selectedDefaultAccountId =
		controller.selectedItem?.defaultPaymentAccountId ?? "";

	useEffect(() => {
		if (!selectedInvoiceId) {
			return;
		}
		setPaymentAccountId(selectedDefaultAccountId);
		setPaymentDate(new Date());
	}, [selectedInvoiceId, selectedDefaultAccountId]);

	return {
		...controller,
		selectedInvoice: controller.selectedItem,
		paymentAccountId,
		setPaymentAccountId,
		paymentDate,
		setPaymentDate,
	};
}
