import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function Loading() {
	return (
		<main className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardContent className="p-4">
						<Skeleton className="h-16 w-full" />
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<Skeleton className="h-16 w-full" />
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<Skeleton className="h-5 w-48" />
				</CardHeader>
				<CardContent className="space-y-3">
					{[1, 2, 3, 4, 5, 6].map((i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</CardContent>
			</Card>
		</main>
	);
}
