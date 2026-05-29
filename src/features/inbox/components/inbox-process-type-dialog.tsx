"use client";

import {
  RiArrowLeftRightLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiUserLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";

export type InboxProcessType =
  | "despesa"
  | "receita"
  | "transferencia-contas"
  | "transferencia-terceiros";

interface InboxProcessTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: InboxProcessType) => void;
}

const options: {
  type: InboxProcessType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    type: "despesa",
    label: "Despesa",
    description: "Compra, pagamento ou saída de dinheiro",
    icon: <RiArrowDownLine className="size-5 text-destructive" />,
  },
  {
    type: "receita",
    label: "Receita",
    description: "Salário, Pix recebido ou entrada de dinheiro",
    icon: <RiArrowUpLine className="size-5 text-green-500" />,
  },
  {
    type: "transferencia-contas",
    label: "Transferência entre contas",
    description: "Movimentação entre suas próprias contas",
    icon: <RiArrowLeftRightLine className="size-5 text-blue-500" />,
  },
  {
    type: "transferencia-terceiros",
    label: "Transferência para terceiros",
    description: "Pix ou transferência enviada para outra pessoa",
    icon: <RiUserLine className="size-5 text-orange-500" />,
  },
];

export function InboxProcessTypeDialog({
  open,
  onOpenChange,
  onSelect,
}: InboxProcessTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Como deseja registrar?</DialogTitle>
          <DialogDescription>
            Selecione o tipo de lançamento para esta notificação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-2">
          {options.map((opt) => (
            <Button
              key={opt.type}
              variant="outline"
              className="flex h-auto items-center justify-start gap-3 px-4 py-3 text-left"
              onClick={() => {
                onOpenChange(false);
                onSelect(opt.type);
              }}
            >
              {opt.icon}
              <div className="flex flex-col">
                <span className="font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}