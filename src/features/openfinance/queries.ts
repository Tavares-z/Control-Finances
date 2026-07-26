import { desc, eq } from "drizzle-orm";
import { financialAccounts, openFinanceConnections } from "@/db/schema";
import { db } from "@/shared/lib/db";

export interface OpenFinanceConnectionListItem {
	id: string;
	connectorName: string | null;
	status: string | null;
	lastSyncedAt: Date | null;
	consentExpiresAt: Date | null;
	/** Item Pluggy — o cliente devolve na action de vínculo (F1.1). */
	pluggyItemId: string;
	/** conta_id local vinculado (null = não vinculada). Fonte de "vinculada?". */
	accountId: string | null;
	/** Nome da conta local vinculada (LEFT JOIN — pode ser null). */
	accountName: string | null;
}

/**
 * Lista as conexões Open Finance do usuário para a aba read-only de Configurações.
 * LEFT JOIN com a conta local (accountId pode ser null / a conta pode ter sido
 * removida). Ordena da mais recente para a mais antiga.
 */
export async function listOpenFinanceConnections(
	userId: string,
): Promise<OpenFinanceConnectionListItem[]> {
	return db
		.select({
			id: openFinanceConnections.id,
			connectorName: openFinanceConnections.connectorName,
			status: openFinanceConnections.status,
			lastSyncedAt: openFinanceConnections.lastSyncedAt,
			consentExpiresAt: openFinanceConnections.consentExpiresAt,
			pluggyItemId: openFinanceConnections.pluggyItemId,
			accountId: openFinanceConnections.accountId,
			accountName: financialAccounts.name,
		})
		.from(openFinanceConnections)
		.leftJoin(
			financialAccounts,
			eq(openFinanceConnections.accountId, financialAccounts.id),
		)
		.where(eq(openFinanceConnections.userId, userId))
		.orderBy(desc(openFinanceConnections.createdAt));
}
