import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

const installmentCards = ["first", "second", "third"];

export default function Loading() {
	return (
		<main className="flex flex-col gap-4 pb-8">
			<Card className="border-none bg-primary/10 shadow-none">
				<CardContent className="flex flex-col items-start justify-center gap-2 py-2">
					<Skeleton className="h-4 w-64 bg-foreground/10" />
					<Skeleton className="h-9 w-36 bg-foreground/10" />
					<Skeleton className="h-4 w-32 bg-foreground/10" />
				</CardContent>
			</Card>

			<Skeleton className="h-8 w-36 bg-foreground/10" />

			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
				{installmentCards.map((card) => (
					<Card key={card} className="overflow-hidden">
						<CardHeader className="pb-0">
							<div className="flex items-start gap-2">
								<Skeleton className="mt-1 size-4 shrink-0 bg-foreground/10" />
								<Skeleton className="size-10 shrink-0 rounded-full bg-foreground/10" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-5 w-32 bg-foreground/10" />
									<Skeleton className="h-4 w-24 bg-foreground/10" />
								</div>
								<Skeleton className="h-5 w-16 rounded-full bg-foreground/10" />
							</div>
						</CardHeader>

						<CardContent>
							<div className="mb-4 grid grid-cols-2 gap-4 rounded-lg bg-primary/5 p-4">
								<div className="space-y-2">
									<Skeleton className="h-3 w-24 bg-foreground/10" />
									<Skeleton className="h-6 w-20 bg-foreground/10" />
								</div>
								<div className="flex flex-col items-end gap-2">
									<Skeleton className="h-3 w-16 bg-foreground/10" />
									<Skeleton className="h-6 w-20 bg-foreground/10" />
								</div>
							</div>

							<div className="mb-4 space-y-2">
								<div className="flex items-center justify-between">
									<Skeleton className="h-3 w-40 bg-foreground/10" />
									<Skeleton className="h-3 w-16 bg-foreground/10" />
								</div>
								<Skeleton className="h-2.5 w-full bg-foreground/10" />
							</div>

							<Skeleton className="h-8 w-full bg-foreground/10" />
						</CardContent>
					</Card>
				))}
			</div>
		</main>
	);
}
