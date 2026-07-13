"use client";

import { RiCloseLine, RiImageAddLine } from "@remixicon/react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	confirmGoalCoverUploadAction,
	getGoalCoverUploadUrlAction,
	removeGoalCoverAction,
} from "@/features/goals/actions";
import { useAttachmentUrlQuery } from "@/features/attachments/hooks/use-attachment-url";
import { GOAL_COVER_MAX_SIZE_MB } from "@/features/goals/lib/goal-cover-config";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";

const ALLOWED_COVER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface GoalCoverUploadProps {
	goalId: string | null;
	coverAttachmentId: string | null;
	onUploaded: () => void;
	onRemoved: () => void;
}

export function GoalCoverUpload({
	goalId,
	coverAttachmentId,
	onUploaded,
	onRemoved,
}: GoalCoverUploadProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isPending, startTransition] = useTransition();
	const [localPreview, setLocalPreview] = useState<string | null>(null);

	const { data: existingUrl } = useAttachmentUrlQuery(
		coverAttachmentId ?? "",
		Boolean(coverAttachmentId) && !localPreview,
	);

	const previewUrl = localPreview ?? existingUrl ?? null;

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!inputRef.current) return;
		inputRef.current.value = "";
		if (!file) return;
		handleFile(file);
	}

	function handleFile(file: File) {
		if (!ALLOWED_COVER_MIME_TYPES.includes(file.type)) {
			toast.error("Envie uma imagem JPEG, PNG ou WebP.");
			return;
		}
		if (file.size > GOAL_COVER_MAX_SIZE_MB * 1024 * 1024) {
			toast.error(`A imagem deve ter no máximo ${GOAL_COVER_MAX_SIZE_MB}MB.`);
			return;
		}
		if (!goalId) {
			toast.error("Salve a meta antes de adicionar uma imagem.");
			return;
		}

		const objectUrl = URL.createObjectURL(file);
		setLocalPreview(objectUrl);

		startTransition(async () => {
			const presignResult = await getGoalCoverUploadUrlAction({
				fileName: file.name,
				mimeType: file.type,
				fileSize: file.size,
				goalId,
			});

			if (!presignResult.success) {
				toast.error(presignResult.error ?? "Erro ao iniciar upload.");
				setLocalPreview(null);
				URL.revokeObjectURL(objectUrl);
				return;
			}

			const uploadResponse = await fetch(presignResult.presignedUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});

			if (!uploadResponse.ok) {
				toast.error("Erro ao enviar a imagem. Tente novamente.");
				setLocalPreview(null);
				URL.revokeObjectURL(objectUrl);
				return;
			}

			const confirmResult = await confirmGoalCoverUploadAction({
				uploadToken: presignResult.uploadToken,
			});

			if (confirmResult.success) {
				toast.success(confirmResult.message);
				onUploaded();
			} else {
				toast.error(confirmResult.error);
				setLocalPreview(null);
				URL.revokeObjectURL(objectUrl);
			}
		});
	}

	function handleRemove() {
		if (!goalId || !coverAttachmentId) {
			setLocalPreview(null);
			onRemoved();
			return;
		}

		startTransition(async () => {
			const result = await removeGoalCoverAction({ goalId });
			if (result.success) {
				setLocalPreview(null);
				onRemoved();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<div className="flex flex-col gap-2">
			<input
				ref={inputRef}
				type="file"
				className="hidden"
				accept={ALLOWED_COVER_MIME_TYPES.join(",")}
				onChange={handleFileChange}
			/>

			{previewUrl ? (
				<div className="relative overflow-hidden rounded-lg border border-border">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={previewUrl}
						alt="Capa da meta"
						className="aspect-video w-full object-cover"
					/>
					<Button
						type="button"
						variant="secondary"
						size="icon"
						className="absolute right-2 top-2 size-7"
						onClick={handleRemove}
						disabled={isPending}
					>
						<RiCloseLine className="size-4" aria-hidden />
						<span className="sr-only">Remover imagem</span>
					</Button>
				</div>
			) : (
				<button
					type="button"
					className={cn(
						"flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-6 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
					)}
					onClick={() => inputRef.current?.click()}
					disabled={isPending}
				>
					<RiImageAddLine className="size-5" aria-hidden />
					{isPending ? "Enviando..." : "Adicionar imagem de capa"}
					{!isPending && (
						<span className="text-xs">
							JPEG, PNG ou WebP · máx. {GOAL_COVER_MAX_SIZE_MB}MB
						</span>
					)}
				</button>
			)}
		</div>
	);
}
