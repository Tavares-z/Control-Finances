"use client";

import { RiArrowDownSLine } from "@remixicon/react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import type {
	BumpType,
	ChangelogVersion,
} from "@/features/settings/lib/changelog-types";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { cn } from "@/shared/utils/ui";

const sectionBadgeVariant: Record<
	string,
	"success" | "info" | "destructive" | "outline" | "secondary"
> = {
	Adicionado: "success",
	Alterado: "info",
	Corrigido: "outline",
	Removido: "destructive",
};

const dotByBump: Record<BumpType, string> = {
	major: "size-4 bg-primary",
	minor: "size-3 bg-primary/80",
	patch: "size-2.5 bg-muted-foreground/40",
};

const bumpLabel: Record<BumpType, string> = {
	major: "Major",
	minor: "Minor",
	patch: "Patch",
};

function versionAnchorId(version: string) {
	return `v${version.replace(/\./g, "-")}`;
}

function anchorIdToVersion(id: string): string | null {
	if (!id.startsWith("v")) return null;
	return id.slice(1).replace(/-/g, ".");
}

function groupByMonth(versions: ChangelogVersion[]) {
	const groups: { key: string; label: string; items: ChangelogVersion[] }[] =
		[];
	for (const v of versions) {
		const date = parseISO(v.isoDate);
		const key = Number.isNaN(date.getTime())
			? v.isoDate.slice(0, 7)
			: format(date, "yyyy-MM");
		const label = Number.isNaN(date.getTime())
			? key
			: format(date, "MMMM 'de' yyyy", { locale: ptBR });
		const last = groups.at(-1);
		if (last?.key === key) last.items.push(v);
		else groups.push({ key, label, items: [v] });
	}
	return groups;
}

function VersionDetails({ version }: { version: ChangelogVersion }) {
	return (
		<Card className="space-y-4 p-4 bg-primary/5 dark:bg-primary/5">
			{version.sections.map((section) => (
				<div key={section.type}>
					<Badge
						variant={sectionBadgeVariant[section.type] ?? "secondary"}
						className="mb-2"
					>
						{section.type}
					</Badge>
					<ul className="space-y-2 text-muted-foreground">
						{section.items.map((item) => (
							<li key={item} className="flex gap-2">
								<span className="text-primary">&bull;</span>
								<span className="text-sm">{item}</span>
							</li>
						))}
					</ul>
				</div>
			))}
		</Card>
	);
}

type TimelineItemProps = {
	version: ChangelogVersion;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isLatest: boolean;
};

function TimelineItem({
	version,
	open,
	onOpenChange,
	isLatest,
}: TimelineItemProps) {
	const hasDetails = version.sections.length > 0;
	const date = parseISO(version.isoDate);
	const validDate = !Number.isNaN(date.getTime());

	return (
		<div className="flex gap-4" id={versionAnchorId(version.version)}>
			<div className="flex flex-col items-center pt-1.5">
				<span
					className={cn(
						"rounded-full ring-4 ring-background shrink-0",
						dotByBump[version.bump],
					)}
					aria-label={`Versão ${bumpLabel[version.bump].toLowerCase()}`}
				/>

				<span className="w-px flex-1 bg-border mt-2" aria-hidden="true" />
			</div>

			<div className="flex-1 pb-6 space-y-3 min-w-0">
				<div className="flex flex-wrap items-baseline gap-x-2">
					<h3 className="font-semibold font-mono text-lg">
						v{version.version}
					</h3>
					{isLatest ? (
						<Badge variant="default" className="text-xs">
							Atual
						</Badge>
					) : null}
					<time
						className="font-mono text-xs uppercase tracking-wider text-muted-foreground"
						dateTime={version.isoDate}
					>
						{validDate
							? format(date, "dd MMM, yyyy", { locale: ptBR }).toUpperCase()
							: version.date}
					</time>
				</div>

				{version.summary ? (
					<Card className="p-6">
						<blockquote className="pl-2 text-sm text-muted-foreground leading-relaxed italic">
							{version.summary}
						</blockquote>
					</Card>
				) : null}

				{hasDetails ? (
					<Collapsible open={open} onOpenChange={onOpenChange}>
						<CollapsibleTrigger asChild>
							<Button
								variant="link"
								size="sm"
								className="text-muted-foreground hover:text-foreground text-xs px-0"
							>
								<RiArrowDownSLine
									className={cn(
										"size-4 transition-transform",
										open && "rotate-180",
									)}
								/>
								{open ? "Ocultar detalhes" : "Ver detalhes"}
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent className="space-y-4 pt-2 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
							<VersionDetails version={version} />
						</CollapsibleContent>
					</Collapsible>
				) : null}
			</div>
		</div>
	);
}

export function ChangelogTab({ versions }: { versions: ChangelogVersion[] }) {
	const [openVersions, setOpenVersions] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		const first = versions[0]?.version;
		if (first) initial.add(first);
		return initial;
	});

	useEffect(() => {
		if (typeof window === "undefined") return;
		const hash = window.location.hash.slice(1);
		if (!hash) return;
		const target = anchorIdToVersion(hash);
		if (target) {
			setOpenVersions((prev) => {
				if (prev.has(target)) return prev;
				const next = new Set(prev);
				next.add(target);
				return next;
			});
		}
		requestAnimationFrame(() => {
			const el = document.getElementById(hash);
			if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	}, []);

	const groups = useMemo(() => groupByMonth(versions), [versions]);
	const latestVersion = versions[0]?.version;
	const setVersionOpen = (version: string, isOpen: boolean) => {
		setOpenVersions((prev) => {
			const next = new Set(prev);
			if (isOpen) next.add(version);
			else next.delete(version);
			return next;
		});
	};

	return (
		<div className="space-y-8 max-w-4xl mx-auto">
			{groups.map((group) => (
				<div key={group.key} className="space-y-4">
					<h2 className="sticky top-0 z-10 py-2 font-semibold uppercase text-primary">
						{group.label}
					</h2>
					<div>
						{group.items.map((version) => (
							<TimelineItem
								key={version.version}
								version={version}
								isLatest={version.version === latestVersion}
								open={openVersions.has(version.version)}
								onOpenChange={(o) => setVersionOpen(version.version, o)}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
