import { RiBankLine } from "@remixicon/react";
import PageDescription from "@/shared/components/page-description";

export const metadata = {
	title: "Contas",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiBankLine />}
				title="Contas"
				subtitle="Acompanhe todas as contas do mês selecionado incluindo receitas,
        despesas e transações previstas."
			/>
			{children}
		</section>
	);
}
