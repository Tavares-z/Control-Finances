"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { transferBetweenAccountsAction } from "@/features/accounts/actions";
import { PeriodPicker } from "@/shared/components/period-picker";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { getTodayDateString } from "@/shared/utils/date";
import { getCurrentPeriod } from "@/shared/utils/period";
import type { SelectOption } from "./types";

interface InboxTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountOptions: SelectOption[];
  defaultAmount?: string | null;
  defaultDate?: string | null;
  onSuccess?: () => void;
}

export function InboxTransferDialog({
  open,
  onOpenChange,
  accountOptions,
  defaultAmount,
  defaultDate,
  onSuccess,
}: InboxTransferDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState(defaultAmount ?? "");
  const [date, setDate] = useState(defaultDate ?? getTodayDateString());
  const [period, setPeriod] = useState(getCurrentPeriod());

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFromAccountId("");
      setToAccountId("");
      setAmount(defaultAmount ?? "");
      setDate(defaultDate ?? getTodayDateString());
      setErrorMessage(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fromAccountId) {
      setErrorMessage("Selecione a conta de origem.");
      return;
    }

    if (!toAccountId) {
      setErrorMessage("Selecione a conta de destino.");
      return;
    }

    if (fromAccountId === toAccountId) {
      setErrorMessage("Conta de origem e destino devem ser diferentes.");
      return;
    }

    if (!amount || parseFloat(amount.replace(",", ".")) <= 0) {
      setErrorMessage("Informe um valor válido maior que zero.");
      return;
    }

    startTransition(async () => {
      const result = await transferBetweenAccountsAction({
        fromAccountId,
        toAccountId,
        amount,
        date: new Date(date),
        period,
      });

      if (result.success) {
        toast.success(result.message);
        handleOpenChange(false);
        onSuccess?.();
        return;
      }

      setErrorMessage(result.error ?? "Erro ao realizar transferência.");
      toast.error(result.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
          <DialogDescription>
            Registre uma transferência entre suas contas.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="inbox-transfer-date">Data</Label>
              <DatePicker
                id="inbox-transfer-date"
                value={date}
                onChange={setDate}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="inbox-transfer-period">Período</Label>
              <PeriodPicker
                value={period}
                onChange={setPeriod}
                className="w-full"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="inbox-transfer-amount">Valor</Label>
              <CurrencyInput
                id="inbox-transfer-amount"
                value={amount}
                onValueChange={setAmount}
                placeholder="R$ 0,00"
                required
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="inbox-from-account">Conta de origem</Label>
              <Select value={fromAccountId} onValueChange={setFromAccountId}>
                <SelectTrigger id="inbox-from-account" className="w-full">
                  <SelectValue placeholder="Selecione a conta de origem" />
                </SelectTrigger>
                <SelectContent>
                  {accountOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="inbox-to-account">Conta de destino</Label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger id="inbox-to-account" className="w-full">
                  <SelectValue placeholder="Selecione a conta de destino" />
                </SelectTrigger>
                <SelectContent>
                  {accountOptions
                    .filter((opt) => opt.value !== fromAccountId)
                    .map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Processando..." : "Confirmar transferência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}