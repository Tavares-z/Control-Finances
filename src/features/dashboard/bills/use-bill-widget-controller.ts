"use client";

import { useEffect, useRef, useState } from "react";
import {
	type BillDialogState,
	getCurrentBillDateString,
	markBillAsSettled,
} from "@/features/dashboard/bills/bills-helpers";
import type { DashboardBill } from "@/features/dashboard/bills/bills-queries";
import {
	type PaymentDialogController,
	usePaymentDialogController,
} from "@/features/dashboard/payments/use-payment-dialog-controller";
import { toggleTransactionSettlementAction } from "@/features/transactions/actions";

const EMPTY_BILLS: DashboardBill[] = [];

type BillWidgetController = Omit<
	PaymentDialogController<DashboardBill>,
	"selectedItem"
> & {
	selectedBill: DashboardBill | null;
	modalState: BillDialogState;
	paymentAccountId: string;
	setPaymentAccountId: (accountId: string) => void;
	paymentDate: Date;
	setPaymentDate: (date: Date) => void;
};

const toIsoDate = (date: Date) => date.toISOString().split("T")[0] ?? "";

export function useBillWidgetController(
	bills?: DashboardBill[],
): BillWidgetController {
	const safeBills = bills ?? EMPTY_BILLS;
	const [paymentAccountId, setPaymentAccountId] = useState<string>("");
	const [paymentDate, setPaymentDate] = useState<Date>(() => new Date());

	const paymentAccountIdRef = useRef(paymentAccountId);
	const paymentDateRef = useRef(paymentDate);
	paymentAccountIdRef.current = paymentAccountId;
	paymentDateRef.current = paymentDate;

	const controller = usePaymentDialogController({
		items: safeBills,
		getItemId: (bill) => bill.id,
		isItemConfirmed: (bill) => bill.isSettled,
		executeConfirm: (bill) =>
			toggleTransactionSettlementAction({
				id: bill.id,
				value: true,
				paymentAccountId: paymentAccountIdRef.current || null,
				paymentDate: toIsoDate(paymentDateRef.current),
			}),
		applyConfirmedState: (bill) =>
			markBillAsSettled(
				{
					...bill,
					accountId: paymentAccountIdRef.current || bill.accountId,
				},
				toIsoDate(paymentDateRef.current) || getCurrentBillDateString(),
			),
	});

	const selectedBillId = controller.selectedItem?.id ?? null;
	const selectedBillAccountId = controller.selectedItem?.accountId ?? "";

	useEffect(() => {
		if (!selectedBillId) {
			return;
		}
		setPaymentAccountId(selectedBillAccountId ?? "");
		setPaymentDate(new Date());
	}, [selectedBillId, selectedBillAccountId]);

	return {
		...controller,
		selectedBill: controller.selectedItem,
		paymentAccountId,
		setPaymentAccountId,
		paymentDate,
		setPaymentDate,
	};
}
