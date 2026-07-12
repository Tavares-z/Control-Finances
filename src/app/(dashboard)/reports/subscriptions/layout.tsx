import { RiRepeatLine } from "@remixicon/react";
import PageDescription from "@/shared/components/page-description";

export const metadata = {
	title: "Projeção de Assinaturas",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiRepeatLine />}
				title="Projeção de Assinaturas"
				subtitle="Quanto suas assinaturas ativas vão custar nos próximos 12 meses"
			/>
			{children}
		</section>
	);
}
