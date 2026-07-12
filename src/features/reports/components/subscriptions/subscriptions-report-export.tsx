"use client";

import {
	RiDownloadLine,
	RiFileExcelLine,
	RiFilePdf2Line,
	RiFileTextLine,
} from "@remixicon/react";
import { useState } from "react";
import { toast } from "sonner";
import type { SubscriptionsAnnualProjection } from "@/features/reports/subscriptions/queries";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateTime } from "@/shared/utils/date";
import {
	getPrimaryPdfColor,
	loadExportLogoDataUrl,
} from "@/shared/utils/export-branding";

interface SubscriptionsReportExportProps {
	data: SubscriptionsAnnualProjection;
}

const loadExcelJS = () => import("exceljs");

const loadPdfDeps = async () => {
	const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
		import("jspdf"),
		import("jspdf-autotable"),
	]);

	return { jsPDF, autoTable };
};

const HEADERS = [
	"Assinatura",
	"Categoria",
	"Valor mensal",
	"Meses",
	"Projeção 12m",
];

const buildRows = (data: SubscriptionsAnnualProjection): string[][] =>
	data.subscriptions.map((item) => [
		item.name,
		item.categoryName ?? "Sem categoria",
		formatCurrency(item.monthlyAmount),
		String(item.monthsRemaining),
		formatCurrency(item.projectedTotal),
	]);

export function SubscriptionsReportExport({
	data,
}: SubscriptionsReportExportProps) {
	const [isExporting, setIsExporting] = useState(false);

	const getFileName = (extension: string) =>
		`relatorio-assinaturas-${new Date().toISOString().slice(0, 10)}.${extension}`;

	const exportToCSV = () => {
		try {
			setIsExporting(true);
			const rows = buildRows(data);
			const totalsRow = ["Total", "", "", "", formatCurrency(data.annualTotal)];
			const csvContent = [
				HEADERS.join(","),
				...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
				totalsRow.map((cell) => `"${cell}"`).join(","),
			].join("\n");

			const blob = new Blob([`﻿${csvContent}`], {
				type: "text/csv;charset=utf-8;",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = getFileName("csv");
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			toast.success("Relatório exportado em CSV com sucesso!");
		} catch (error) {
			console.error("Error exporting to CSV:", error);
			toast.error("Erro ao exportar relatório em CSV");
		} finally {
			setIsExporting(false);
		}
	};

	const exportToExcel = async () => {
		try {
			setIsExporting(true);
			const ExcelJS = await loadExcelJS();
			const rows = buildRows(data);
			const totalsRow = ["Total", "", "", "", formatCurrency(data.annualTotal)];

			const workbook = new ExcelJS.Workbook();
			const ws = workbook.addWorksheet("Assinaturas");
			ws.addRows([HEADERS, ...rows, totalsRow]);
			ws.getColumn(1).width = 24;
			ws.getColumn(2).width = 18;
			ws.getColumn(3).width = 15;
			ws.getColumn(4).width = 10;
			ws.getColumn(5).width = 15;

			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = getFileName("xlsx");
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			toast.success("Relatório exportado em Excel com sucesso!");
		} catch (error) {
			console.error("Error exporting to Excel:", error);
			toast.error("Erro ao exportar relatório em Excel");
		} finally {
			setIsExporting(false);
		}
	};

	const exportToPDF = async () => {
		try {
			setIsExporting(true);
			const { jsPDF, autoTable } = await loadPdfDeps();

			const doc = new jsPDF({ orientation: "landscape" });
			const primaryColor = getPrimaryPdfColor();
			const [smallLogoDataUrl, textLogoDataUrl] = await Promise.all([
				loadExportLogoDataUrl("/images/logo_small.svg"),
				loadExportLogoDataUrl("/images/logo_text.svg"),
			]);
			let brandingEndX = 14;

			if (smallLogoDataUrl) {
				doc.addImage(smallLogoDataUrl, "PNG", brandingEndX, 7.5, 8, 8);
				brandingEndX += 10;
			}
			if (textLogoDataUrl) {
				doc.addImage(textLogoDataUrl, "PNG", brandingEndX, 8, 30, 8);
				brandingEndX += 32;
			}

			const titleX = brandingEndX > 14 ? brandingEndX + 4 : 14;

			doc.setFont("courier", "normal");
			doc.setFontSize(16);
			doc.text("Projeção Anual de Assinaturas", titleX, 15);

			doc.setFontSize(10);
			doc.text(
				`Total mensal: ${formatCurrency(data.monthlyTotal)}  |  Projeção 12 meses: ${formatCurrency(data.annualTotal)}`,
				titleX,
				22,
			);
			doc.text(
				`Gerado em: ${
					formatDateTime(new Date(), {
						day: "2-digit",
						month: "2-digit",
						year: "numeric",
					}) ?? "—"
				}`,
				titleX,
				27,
			);
			doc.setDrawColor(...primaryColor);
			doc.setLineWidth(0.5);
			doc.line(14, 31, doc.internal.pageSize.getWidth() - 14, 31);

			const rows = buildRows(data);
			const totalsRow = ["Total", "", "", "", formatCurrency(data.annualTotal)];

			autoTable(doc, {
				head: [HEADERS],
				body: [...rows, totalsRow],
				startY: 35,
				tableWidth: "auto",
				styles: { font: "courier", fontSize: 8, cellPadding: 2 },
				headStyles: {
					fillColor: primaryColor,
					textColor: 255,
					fontStyle: "bold",
				},
				didParseCell: (cellData) => {
					if (
						cellData.row.index === rows.length &&
						cellData.section === "body"
					) {
						cellData.cell.styles.fillColor = [243, 244, 246];
						cellData.cell.styles.fontStyle = "bold";
					}
				},
				margin: { top: 35 },
			});

			doc.save(getFileName("pdf"));
			toast.success("Relatório exportado em PDF com sucesso!");
		} catch (error) {
			console.error("Error exporting to PDF:", error);
			toast.error("Erro ao exportar relatório em PDF");
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					className="text-sm border-dashed"
					disabled={isExporting || data.subscriptions.length === 0}
					aria-label="Exportar relatório de assinaturas"
				>
					<RiDownloadLine className="mr-2 h-4 w-4" aria-hidden="true" />
					{isExporting ? "Exportando..." : "Exportar"}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={exportToCSV} disabled={isExporting}>
					<RiFileTextLine className="mr-2 h-4 w-4" aria-hidden="true" />
					Exportar como CSV
				</DropdownMenuItem>
				<DropdownMenuItem onClick={exportToExcel} disabled={isExporting}>
					<RiFileExcelLine className="mr-2 h-4 w-4" aria-hidden="true" />
					Exportar como Excel (.xlsx)
				</DropdownMenuItem>
				<DropdownMenuItem onClick={exportToPDF} disabled={isExporting}>
					<RiFilePdf2Line className="mr-2 h-4 w-4" aria-hidden="true" />
					Exportar como PDF
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
