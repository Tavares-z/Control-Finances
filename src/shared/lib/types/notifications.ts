type NotificationType = "overdue" | "due_soon";

type BudgetStatus = "exceeded" | "critical";

type AnomalySeverity = "severe" | "moderate";

type DashboardNotificationStateFields = {
	notificationKey: string;
	fingerprint: string;
	href: string;
	isRead: boolean;
	isArchived: boolean;
	readAt: Date | null;
	archivedAt: Date | null;
};

export type DashboardNotification = {
	type: "invoice" | "boleto";
	name: string;
	dueDate: string;
	status: NotificationType;
	amount: number;
	period?: string;
	showAmount: boolean;
	cardLogo?: string | null;
} & DashboardNotificationStateFields;

export type BudgetNotification = {
	categoryName: string;
	budgetAmount: number;
	spentAmount: number;
	usedPercentage: number;
	status: BudgetStatus;
} & DashboardNotificationStateFields;

export type SpendingAnomalyNotification = {
	categoryName: string;
	currentAmount: number;
	averageAmount: number;
	percentageAboveAverage: number;
	status: AnomalySeverity;
} & DashboardNotificationStateFields;

export type DashboardNotificationsSnapshot = {
	notifications: DashboardNotification[];
	budgetNotifications: BudgetNotification[];
	anomalyNotifications: SpendingAnomalyNotification[];
	unreadCount: number;
	visibleCount: number;
};
