import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonPage,
  IonText,
} from "@ionic/react";
import { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { arrowBackOutline, refreshOutline, shieldCheckmarkOutline } from "ionicons/icons";
import { useHistory } from "react-router";
import {
  getAdminDashboardMetrics,
  isOwnerAdminEmail,
  listAdminUsers,
  setAdminUserBan,
  updateAdminUserPlan,
} from "../lib/supabaseClient";
import { AdminDowngradeTiming, AdminUserRow, Plan } from "../types";
import { getPlanLabel } from "../lib/plans";
import "./AdminPage.css";

type Props = {
  user: User | null;
};

type PerUserDraft = {
  targetPlan: Plan;
  downgradeTiming: AdminDowngradeTiming;
};

const AdminPage: React.FC<Props> = ({ user }) => {
  const history = useHistory();
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof getAdminDashboardMetrics>> | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [draftsByUser, setDraftsByUser] = useState<Record<string, PerUserDraft>>({});

  const isOwner = isOwnerAdminEmail(user?.email);
  const pageSize = 25;

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalUsers / pageSize));
  }, [totalUsers]);

  useEffect(() => {
    if (!isOwner) {
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [metricsData, usersData] = await Promise.all([
          getAdminDashboardMetrics(),
          listAdminUsers(page, pageSize, search),
        ]);

        if (cancelled) return;

        setMetrics(metricsData);
        setUsers(usersData.users);
        setTotalUsers(usersData.total);
        setDraftsByUser((prev) => {
          const next = { ...prev };
          for (const row of usersData.users) {
            if (!next[row.id]) {
              next[row.id] = {
                targetPlan: row.plan,
                downgradeTiming: "immediate",
              };
            }
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load admin data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [isOwner, page, pageSize, search]);

  async function refreshData() {
    if (!isOwner) return;
    setLoading(true);
    setError("");
    try {
      const [metricsData, usersData] = await Promise.all([
        getAdminDashboardMetrics(),
        listAdminUsers(page, pageSize, search),
      ]);
      setMetrics(metricsData);
      setUsers(usersData.users);
      setTotalUsers(usersData.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh admin data.");
    } finally {
      setLoading(false);
    }
  }

  function setDraft(userId: string, update: Partial<PerUserDraft>) {
    setDraftsByUser((prev) => ({
      ...prev,
      [userId]: {
        targetPlan: prev[userId]?.targetPlan ?? "free",
        downgradeTiming: prev[userId]?.downgradeTiming ?? "immediate",
        ...update,
      },
    }));
  }

  async function handleApplyPlan(row: AdminUserRow) {
    const draft = draftsByUser[row.id] ?? { targetPlan: row.plan, downgradeTiming: "immediate" as AdminDowngradeTiming };

    setBusyUserId(row.id);
    setStatus("");
    setError("");
    try {
      const result = await updateAdminUserPlan(row.id, draft.targetPlan, draft.downgradeTiming);
      setStatus(`${row.email}: ${result.message}`);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan update failed.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleToggleBan(row: AdminUserRow) {
    const nextBannedState = !row.is_banned;
    const reason = nextBannedState ? window.prompt("Ban reason (optional):", row.banned_reason ?? "") ?? "" : "";

    setBusyUserId(row.id);
    setStatus("");
    setError("");
    try {
      const result = await setAdminUserBan(row.id, nextBannedState, reason);
      setStatus(`${row.email}: ${result.message}`);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ban update failed.");
    } finally {
      setBusyUserId(null);
    }
  }

  if (!user || !isOwner) {
    return (
      <IonPage>
        <IonContent className="admin-shell">
          <div className="admin-wrap">
            <IonCard className="admin-card admin-card--hero">
              <IonCardContent>
                <p className="admin-kicker">Restricted</p>
                <h1>Owner access only</h1>
                <p>This page is reserved for the configured owner account.</p>
                <IonButton onClick={() => history.push("/settings")} fill="outline" color="light">
                  <IonIcon icon={arrowBackOutline} slot="start" />
                  Back to Dashboard
                </IonButton>
              </IonCardContent>
            </IonCard>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent className="admin-shell">
        <div className="admin-wrap">
          <div className="admin-toolbar">
            <IonButton fill="clear" onClick={() => history.push("/settings")}>
              <IonIcon icon={arrowBackOutline} slot="start" />
              Back to Dashboard
            </IonButton>
            <IonButton fill="outline" onClick={() => void refreshData()} disabled={loading}>
              <IonIcon icon={refreshOutline} slot="start" />
              Refresh
            </IonButton>
          </div>

          <IonCard className="admin-card admin-card--hero">
            <IonCardContent>
              <p className="admin-kicker">Admin Panel</p>
              <h1>Account, billing, and moderation controls</h1>
              <p>Manage subscription tiers, ban status, and platform-wide usage metrics.</p>
              {(status || error) && (
                <IonText color={error ? "danger" : "success"}>
                  <p>{error || status}</p>
                </IonText>
              )}
            </IonCardContent>
          </IonCard>

          <div className="admin-metrics-grid">
            <IonCard className="admin-card">
              <IonCardHeader>
                <IonCardTitle>Platform Totals</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p><strong>Users:</strong> {(metrics?.total_users ?? 0).toLocaleString()}</p>
                <p><strong>Tags:</strong> {(metrics?.total_tags ?? 0).toLocaleString()}</p>
                <p><strong>All-time scans:</strong> {(metrics?.total_scans ?? 0).toLocaleString()}</p>
                <p><strong>Paid users:</strong> {(metrics?.paid_users ?? 0).toLocaleString()}</p>
                <p><strong>Free users:</strong> {(metrics?.free_users ?? 0).toLocaleString()}</p>
                <p><strong>Banned users:</strong> {(metrics?.banned_users ?? 0).toLocaleString()}</p>
              </IonCardContent>
            </IonCard>

            <IonCard className="admin-card">
              <IonCardHeader>
                <IonCardTitle>Scan Velocity</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p><strong>Last 7 days:</strong> {(metrics?.scans_last_7_days ?? 0).toLocaleString()}</p>
                <p><strong>Last 30 days:</strong> {(metrics?.scans_last_30_days ?? 0).toLocaleString()}</p>
                <p className="admin-muted">Top users by scans</p>
                <ul className="admin-top-users">
                  {(metrics?.top_users_by_scans ?? []).map((row) => (
                    <li key={row.user_id}>
                      <span>{row.email ?? row.user_id}</span>
                      <strong>{row.total_scans.toLocaleString()}</strong>
                    </li>
                  ))}
                  {!metrics?.top_users_by_scans?.length && <li>No scan leaders yet.</li>}
                </ul>
              </IonCardContent>
            </IonCard>
          </div>

          <IonCard className="admin-card">
            <IonCardHeader>
              <IonCardTitle>Users</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <div className="admin-user-toolbar">
                <input
                  className="admin-search-input"
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by email"
                />
                <IonButton
                  size="small"
                  onClick={() => {
                    setPage(1);
                    setSearch(searchInput.trim());
                  }}
                >
                  Search
                </IonButton>
                <IonButton
                  size="small"
                  fill="outline"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                    setPage(1);
                  }}
                >
                  Clear
                </IonButton>
              </div>

              <div className="admin-users-list" aria-busy={loading}>
                {loading && <p>Loading users...</p>}
                {!loading && !users.length && <p>No users found.</p>}
                {users.map((row) => {
                  const draft = draftsByUser[row.id] ?? { targetPlan: row.plan, downgradeTiming: "immediate" as AdminDowngradeTiming };
                  const rowBusy = busyUserId === row.id;

                  return (
                    <div className="admin-user-row" key={row.id}>
                      <div className="admin-user-row__identity">
                        <div>
                          <strong>{row.email}</strong>
                          <p>ID: {row.id}</p>
                        </div>
                        <div className="admin-user-row__badges">
                          <IonBadge color={row.is_banned ? "danger" : "success"}>
                            {row.is_banned ? "Banned" : "Active"}
                          </IonBadge>
                          <IonBadge color="medium">{getPlanLabel(row.plan)}</IonBadge>
                        </div>
                      </div>

                      <div className="admin-user-row__stats">
                        <span>Tags: {row.total_tags.toLocaleString()}</span>
                        <span>Total scans: {row.total_scans.toLocaleString()}</span>
                        <span>Monthly scans: {row.monthly_scans.toLocaleString()}</span>
                        <span>Billing: {row.billing_cycle}</span>
                      </div>

                      <div className="admin-user-row__actions">
                        <select
                          value={draft.targetPlan}
                          onChange={(event) => setDraft(row.id, { targetPlan: event.target.value as Plan })}
                        >
                          <option value="free">Free</option>
                          <option value="premium_monthly">Premium Monthly</option>
                          <option value="premium_yearly">Premium Yearly</option>
                          <option value="lifetime">Lifetime</option>
                        </select>

                        <select
                          value={draft.downgradeTiming}
                          onChange={(event) => setDraft(row.id, { downgradeTiming: event.target.value as AdminDowngradeTiming })}
                        >
                          <option value="immediate">Immediate</option>
                          <option value="period_end">At Period End</option>
                        </select>

                        <IonButton size="small" disabled={rowBusy} onClick={() => void handleApplyPlan(row)}>
                          <IonIcon icon={shieldCheckmarkOutline} slot="start" />
                          Apply Plan
                        </IonButton>

                        <IonButton
                          size="small"
                          color={row.is_banned ? "success" : "danger"}
                          fill="outline"
                          disabled={rowBusy}
                          onClick={() => void handleToggleBan(row)}
                        >
                          {row.is_banned ? "Unban" : "Ban"}
                        </IonButton>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="admin-pagination">
                <IonButton size="small" fill="outline" disabled={page <= 1 || loading} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                  Prev
                </IonButton>
                <span>Page {page} / {totalPages}</span>
                <IonButton size="small" fill="outline" disabled={page >= totalPages || loading} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                  Next
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminPage;
