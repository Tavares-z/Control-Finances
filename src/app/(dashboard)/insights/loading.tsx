import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

const providers = [
	"openai",
	"anthropic",
	"google",
	"minimax",
	"openrouter",
	"ollama",
];

const summaryRows = ["period", "data-source"];

export default function InsightsLoading() {
	return (
		<main className="flex flex-col gap-6">
			<Card className="flex w-full flex-row items-center justify-between gap-2 px-3 py-3 sm:px-4">
				<div className="flex items-center gap-2">
					<Skeleton className="size-8 bg-foreground/10" />
					<Skeleton className="h-8 w-40 bg-foreground/10" />
					<Skeleton className="size-8 bg-foreground/10" />
				</div>
			</Card>

			<section className="space-y-4">
				<div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
					<div className="space-y-4">
						<Card className="border-border/70 bg-card/95 shadow-sm">
							<CardContent className="space-y-6">
								<div className="space-y-2">
									<Skeleton className="h-8 w-64 bg-foreground/10" />
									<Skeleton className="h-4 w-full max-w-2xl bg-foreground/10" />
									<Skeleton className="h-4 w-3/4 max-w-xl bg-foreground/10" />
								</div>

								<div className="space-y-3">
									<div className="space-y-2">
										<Skeleton className="h-4 w-28 bg-foreground/10" />
										<Skeleton className="h-3 w-80 max-w-full bg-foreground/10" />
									</div>

									<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
										{providers.map((provider) => (
											<div
												className="flex min-h-24 items-start gap-3 rounded-2xl border p-4"
												key={provider}
											>
												<Skeleton className="mt-1 size-4 shrink-0 rounded-full bg-foreground/10" />
												<Skeleton className="size-8 shrink-0 rounded-full bg-foreground/10" />
												<div className="flex-1 space-y-2">
													<Skeleton className="h-4 w-20 bg-foreground/10" />
													<Skeleton className="h-3 w-full bg-foreground/10" />
													<Skeleton className="h-3 w-3/4 bg-foreground/10" />
												</div>
											</div>
										))}
									</div>
								</div>
							</CardContent>
						</Card>

						<Card className="border-border/70 bg-card/95 shadow-sm">
							<CardContent className="space-y-6">
								<div className="space-y-3">
									<div className="space-y-2">
										<Skeleton className="h-4 w-32 bg-foreground/10" />
										<Skeleton className="h-3 w-72 max-w-full bg-foreground/10" />
									</div>
									<Skeleton className="h-9 w-full max-w-72 bg-foreground/10" />
								</div>

								<div className="flex items-center justify-between gap-3">
									<Skeleton className="h-9 w-24 bg-foreground/10" />
									<Skeleton className="h-9 w-32 bg-foreground/10" />
								</div>
							</CardContent>
						</Card>
					</div>

					<Card className="border-border/70 bg-card/95 shadow-sm">
						<CardContent className="flex flex-col gap-4">
							<div className="flex items-center gap-3">
								<Skeleton className="size-9 rounded-xl bg-foreground/10" />
								<div className="space-y-2">
									<Skeleton className="h-4 w-32 bg-foreground/10" />
									<Skeleton className="h-3 w-24 bg-foreground/10" />
								</div>
							</div>

							<Skeleton className="h-9 w-full bg-foreground/10" />
							<Skeleton className="h-8 w-full bg-foreground/10" />

							<div className="space-y-4">
								{summaryRows.map((row) => (
									<div className="flex gap-3" key={row}>
										<Skeleton className="size-4 shrink-0 bg-foreground/10" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-3 w-24 bg-foreground/10" />
											<Skeleton className="h-3 w-full bg-foreground/10" />
										</div>
									</div>
								))}
							</div>

							<div className="space-y-3">
								<Skeleton className="h-3 w-32 bg-foreground/10" />
								<div className="flex items-center gap-3">
									<Skeleton className="size-8 rounded-full bg-foreground/10" />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-4 w-20 bg-foreground/10" />
										<Skeleton className="h-3 w-32 bg-foreground/10" />
									</div>
								</div>
							</div>

							<Skeleton className="h-20 w-full rounded-2xl bg-foreground/10" />
							<Skeleton className="h-20 w-full rounded-2xl bg-foreground/10" />
						</CardContent>
					</Card>
				</div>
			</section>
		</main>
	);
}
