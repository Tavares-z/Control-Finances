import type {
	BudgetNotification,
	DashboardNotification,
	SpendingAnomalyNotification,
} from "@/shared/lib/types/notifications";

export type StatefulNotification = {
	notificationKey: string;
	fingerprint: string;
	href: string;
	isRead: boolean;
	isArchived: boolean;
	readAt: Date | null;
	archivedAt: Date | null;
};

export type NotificationActionState = {
	isRead: boolean;
	isArchived: boolean;
	isBusy: boolean;
};

export type NotificationViewMode = "active" | "archived";

export type ResolvedDashboardNotification = DashboardNotification & {
	isBusy: boolean;
};

export type ResolvedBudgetNotification = BudgetNotification & {
	isBusy: boolean;
};

export type ResolvedSpendingAnomalyNotification =
	SpendingAnomalyNotification & {
		isBusy: boolean;
	};

export type NotificationBellProps = {
	notifications: DashboardNotification[];
	unreadCount: number;
	visibleCount: number;
	budgetNotifications: BudgetNotification[];
	anomalyNotifications: SpendingAnomalyNotification[];
	inboxPendingCount?: number;
};
