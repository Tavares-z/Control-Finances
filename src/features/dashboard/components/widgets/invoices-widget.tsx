"use client";

import type {
	DashboardInvoice,
	InvoicePaymentAccountOption,
} from "@/features/dashboard/invoices/invoices-queries";
import { useInvoicesWidgetController } from "@/features/dashboard/invoices/use-invoices-widget-controller";
import { InvoicesWidgetView } from "../invoices/invoices-widget-view";

type InvoicesWidgetProps = {
	invoices: DashboardInvoice[];
	paymentAccountOptions: InvoicePaymentAccountOption[];
};

export function InvoicesWidget({
	invoices,
	paymentAccountOptions,
}: InvoicesWidgetProps) {
	const {
		items,
		selectedInvoice,
		isModalOpen,
		modalState,
		isPending,
		paymentAccountId,
		setPaymentAccountId,
		paymentDate,
		setPaymentDate,
		openPaymentDialog,
		closePaymentDialog,
		confirmPayment,
	} = useInvoicesWidgetController(invoices);

	return (
		<InvoicesWidgetView
			invoices={items}
			selectedInvoice={selectedInvoice}
			isModalOpen={isModalOpen}
			modalState={modalState}
			isPending={isPending}
			paymentAccountId={paymentAccountId}
			onPaymentAccountChange={setPaymentAccountId}
			paymentDate={paymentDate}
			onPaymentDateChange={setPaymentDate}
			paymentAccountOptions={paymentAccountOptions}
			onOpenPaymentDialog={openPaymentDialog}
			onClosePaymentDialog={closePaymentDialog}
			onConfirmPayment={confirmPayment}
		/>
	);
}
