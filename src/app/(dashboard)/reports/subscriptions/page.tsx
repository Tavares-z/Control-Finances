import { connection } from "next/server";
import { SubscriptionsReportExport } from "@/features/reports/components/subscriptions/subscriptions-report-export";
import { fetchSubscriptionsAnnualProjection } from "@/features/reports/subscriptions/queries";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { getUser } from "@/shared/lib/auth/server";
import { formatCurrency } from "@/shared/utils/currency";
import { getIconComponent } from "@/shared/utils/icons";

export default async function SubscriptionsReportPage() {
	await connection();
	const user = await getUser();
	const data = await fetchSubscriptionsAnnualProjection(user.id);

	return (
		<main className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-sm text-muted-foreground font-normal">
							Total mensal
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold">
							{formatCurrency(data.monthlyTotal)}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm text-muted-foreground font-normal">
							Projeção 12 meses
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-semibold">
							{formatCurrency(data.annualTotal)}
						</p>
					</CardContent>
				</Card>
			</div>

			{data.subscriptions.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
						<p className="text-sm font-medium">Nenhuma assinatura ativa</p>
						<p className="text-xs text-muted-foreground max-w-xs">
							Cadastre suas assinaturas em /assinaturas para ver a projeção
							anual aqui.
						</p>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between gap-4">
						<CardTitle className="text-base">Assinaturas ativas</CardTitle>
						<SubscriptionsReportExport data={data} />
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Assinatura</TableHead>
									<TableHead>Categoria</TableHead>
									<TableHead className="text-right">Valor mensal</TableHead>
									<TableHead className="text-right">Meses</TableHead>
									<TableHead className="text-right">Projeção 12m</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.subscriptions.map((item) => {
									const Icon = item.icon ? getIconComponent(item.icon) : null;
									return (
										<TableRow key={item.id}>
											<TableCell className="flex items-center gap-2 font-medium">
												{Icon ? (
													<Icon
														className="size-4 text-muted-foreground"
														aria-hidden
													/>
												) : null}
												{item.name}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{item.categoryName ?? "Sem categoria"}
											</TableCell>
											<TableCell className="text-right">
												{formatCurrency(item.monthlyAmount)}
											</TableCell>
											<TableCell className="text-right">
												{item.monthsRemaining}
											</TableCell>
											<TableCell className="text-right font-medium">
												{formatCurrency(item.projectedTotal)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			{data.byCategory.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Por categoria</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{data.byCategory.map((entry) => (
							<div
								key={entry.categoryName}
								className="flex items-center justify-between text-sm"
							>
								<span className="text-muted-foreground">
									{entry.categoryName}
								</span>
								<span className="font-medium">
									{formatCurrency(entry.total)}
								</span>
							</div>
						))}
					</CardContent>
				</Card>
			) : null}
		</main>
	);
}
