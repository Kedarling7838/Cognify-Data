
import { useEffect, useState } from "react";

import {
  LayoutDashboard,
  Database,
  Upload,
  BrainCircuit,
  ChartNoAxesCombined,
  FileText,
  Search,
  Bell,
  ArrowUpRight,
  Rows3,
  Sparkles,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  Users,
  Globe,
} from "lucide-react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

import UploadDataset from "./components/UploadDataset";
import DatasetHistory from "./components/DatasetHistory";
import DatasetAnalytics from "./components/DatasetAnalytics";
import DataSources from "./components/DataSources";
import Auth from "./components/Auth";
import WebScraper from "./components/WebScraper";
import AIDataAnalyst from "./components/AIDataAnalyst";
import AIReportGenerator from "./components/AIReportGenerator";
import { getDashboardStats, getAdminDashboardStats, getAdminUsers, updateAdminUserRole, updateAdminUserStatus } from "./services/api";
import { getCurrentUser, logoutUser } from "./services/auth";
import Swal from "sweetalert2";

import "./App.css";

const activityData = [
  { day: "Mon", records: 120 },
  { day: "Tue", records: 185 },
  { day: "Wed", records: 150 },
  { day: "Thu", records: 240 },
  { day: "Fri", records: 205 },
  { day: "Sat", records: 280 },
  { day: "Sun", records: 320 },
];

const qualityData = [
  { category: "Complete", value: 78 },
  { category: "Missing", value: 12 },
  { category: "Duplicates", value: 6 },
  { category: "Anomalies", value: 4 },
];

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Data Sources", icon: Database },
  { label: "Web Scraping", icon: Globe },
  { label: "Upload Data", icon: Upload },
  { label: "Dataset History", icon: Database },
  { label: "Analytics", icon: ChartNoAxesCombined },
  { label: "AI Analyst", icon: BrainCircuit },
  { label: "Reports", icon: FileText },
];

function LandingPage({ onLogin, onRegister }) {
  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <a className="landing-brand" href="#home" aria-label="Cognify Data home">
          <span className="landing-brand-icon"><Sparkles size={22} /></span>
          <span>Cognify<span>Data</span></span>
        </a>

        <div className="landing-nav-links">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
        </div>

        <div className="landing-nav-actions">
          <button type="button" className="landing-login" onClick={onLogin}>Sign In</button>
          <button type="button" className="landing-register" onClick={onRegister}>
            Get Started <ArrowUpRight size={16} />
          </button>
        </div>
      </nav>

      <section className="landing-hero" id="home">
        <div className="landing-overlay" />
        <div className="landing-hero-content">
          <div className="landing-eyebrow"><span /> AI-POWERED DATA INTELLIGENCE PLATFORM</div>
          <h1>Your Data.<br />Your Intelligence.<br /><span>Your Advantage.</span></h1>
          <p>
            Connect databases, explore information, uncover patterns and transform
            raw data into meaningful decisions with Cognify Data.
          </p>
          <div className="landing-hero-actions">
            <button type="button" onClick={onRegister}>Explore Your Workspace <ArrowUpRight size={18} /></button>
            <button type="button" className="landing-secondary" onClick={onLogin}>Sign In <ArrowUpRight size={17} /></button>
          </div>
          <div className="landing-trust">
            <span><Database size={16} /> Multiple data sources</span>
            <span><BrainCircuit size={16} /> Intelligent analytics</span>
            <span><ShieldCheck size={16} /> Personal workspace</span>
          </div>
        </div>
        <div className="landing-hero-bottom">
          <span>DATA · DISCOVERY · DECISIONS</span>
          <span>COGNIFY DATA / 01</span>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-heading">
          <span>WHAT YOU CAN DO</span>
          <h2>One platform. Multiple possibilities.</h2>
          <p>Bring your data together and make analysis easier.</p>
        </div>
        <div className="landing-feature-grid">
          <article><Database size={25} /><h3>Database Connectivity</h3><p>Connect supported SQL and NoSQL databases and bring your data into one workspace.</p></article>
          <article><ChartNoAxesCombined size={25} /><h3>Data Analytics</h3><p>Explore dataset summaries, missing values, duplicates and useful visualizations.</p></article>
          <article><BrainCircuit size={25} /><h3>AI Intelligence</h3><p>Build towards AI-assisted analysis and data-driven insights.</p></article>
          <article><Upload size={25} /><h3>Easy Data Import</h3><p>Upload CSV, Excel and JSON datasets for analysis.</p></article>
        </div>
      </section>

      <section className="landing-cta" id="about">
        <div>
          <span>START YOUR DATA JOURNEY</span>
          <h2>Make your data work smarter.</h2>
          <p>Create your Cognify Data account and start exploring your data workspace.</p>
        </div>
        <button type="button" onClick={onRegister}>Create Free Account <ArrowUpRight size={18} /></button>
      </section>

      <footer className="landing-footer">
        <span>Cognify Data</span>
        <span>AI-powered data intelligence</span>
        <span>© {new Date().getFullYear()} Cognify Data</span>
      </footer>
    </div>
  );
}

function AdminDashboard({ currentUser, displayName, initials, stats, statsLoading, statsError, onRefreshStats, onLogout }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [activeSection, setActiveSection] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError("");
    try {
      const result = await getAdminUsers();
      setUsers(result.users || []);
    } catch (error) {
      setUsersError(error.message || "Unable to load registered users.");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleRoleChange(userId, role) {
    setUpdatingUserId(userId);
    try {
      const result = await updateAdminUserRole(userId, role);
      setUsers((previous) => previous.map((user) => user.id === userId ? { ...user, ...result.user } : user));
    } catch (error) {
      window.alert(error.message || "Unable to update user role.");
      await loadUsers();
    } finally { setUpdatingUserId(null); }
  }

  async function handleStatusChange(user) {
    const nextStatus = !user.is_active;
    if (!window.confirm(`${nextStatus ? "Activate" : "Deactivate"} ${user.username}?`)) return;
    setUpdatingUserId(user.id);
    try {
      const result = await updateAdminUserStatus(user.id, nextStatus);
      setUsers((previous) => previous.map((item) => item.id === user.id ? { ...item, ...result.user } : item));
    } catch (error) {
      window.alert(error.message || "Unable to update account status.");
      await loadUsers();
    } finally { setUpdatingUserId(null); }
  }

  const filteredUsers = users.filter((user) =>
    [user.username, user.email, user.full_name, user.role].filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchTerm.trim().toLowerCase()))
  );
  const countRole = (role) => users.filter((user) => user.role === role).length;
  const navItems = [
    { label: "Overview", icon: LayoutDashboard, target: "admin-overview" },
    { label: "User Management", icon: Users, target: "admin-users" },
    { label: "Dataset Monitoring", icon: Database, target: "admin-overview" },
    { label: "Analytics", icon: ChartNoAxesCombined, target: "admin-analytics" },
  ];
  const scrollToSection = (label, target) => {
    setActiveSection(label);
    setSidebarOpen(false);

    // Refresh platform statistics whenever the administrator returns to Overview.
    if (label === "Overview" || label === "Dataset Monitoring") {
      onRefreshStats();
    }

    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="admin-dashboard">
      <aside className={`admin-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <a className="admin-brand" href="#admin-overview" onClick={() => scrollToSection("Overview", "admin-overview")}>
          <span className="admin-brand-mark"><Sparkles size={21} /></span>
          <span>Cognify<span>Data</span><small>INTELLIGENCE PLATFORM</small></span>
        </a>
        <div className="admin-sidebar-caption">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map(({ label, icon: Icon, target }) => (
            <button key={label} type="button" className={activeSection === label ? "active" : ""} onClick={() => scrollToSection(label, target)}>
              <Icon size={18} /><span>{label}</span>{label === "User Management" && <b>{users.length}</b>}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-ai-card"><div className="admin-ai-orbit"><BrainCircuit size={28} /></div><strong>AI workspace</strong><p>Your data intelligence hub is ready.</p><span><i /> SYSTEM ONLINE</span></div>
          <div className="admin-sidebar-user"><div className="admin-avatar">{initials}</div><div><strong>{displayName}</strong><small>Administrator</small></div><button type="button" title="Logout" onClick={onLogout}><LogOut size={17} /></button></div>
        </div>
      </aside>
      {sidebarOpen && <button className="admin-sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button type="button" className="admin-menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
            <div className="admin-breadcrumb">Workspace <span>/</span> <strong>{activeSection}</strong></div>
          </div>
          <div className="admin-topbar-right">
            <label className="admin-global-search"><Search size={16} /><input placeholder="Search workspace..." aria-label="Search workspace" /></label>
            <span className="admin-live-pill"><i /> Live system</span>
            <button type="button" className="admin-icon-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="admin-top-profile"><div className="admin-avatar">{initials}</div><div><strong>{displayName}</strong><small>Co-Administrator</small></div></div>
            <button type="button" className="admin-logout-button" onClick={onLogout}><LogOut size={16} /><span>Logout</span></button>
          </div>
        </header>

        <main className="admin-main" id="admin-overview">
          <div className="admin-heading">
            <div><span className="admin-eyebrow">PLATFORM CONTROL CENTER</span><h1>Dashboard overview</h1><p>Welcome back, {displayName}. Here's what's happening across your workspace.</p></div>
            <div className="admin-heading-actions">
              <button
                type="button"
                className="admin-refresh-button"
                onClick={onRefreshStats}
                disabled={statsLoading}
                aria-label="Refresh dashboard statistics"
              >
                {statsLoading ? "Refreshing..." : "↻ Refresh statistics"}
              </button>
              <span className="admin-date-chip">{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              <span className="admin-status"><i /> ALL SYSTEMS NORMAL</span>
            </div>
          </div>

          {statsError && (
            <p className="admin-user-error" role="alert">
              {statsError}
              <button type="button" onClick={onRefreshStats}>Try again</button>
            </p>
          )}

          <section className="admin-stat-grid">
            <article className="admin-metric-card metric-violet"><div className="admin-metric-top"><span>Total datasets</span><span className="admin-metric-icon"><Database size={18} /></span></div><strong>{stats.total_datasets ?? 0}</strong><small><span>●</span> Across the platform</small><div className="admin-sparkline"><svg viewBox="0 0 140 38" preserveAspectRatio="none"><path d="M1 30 C18 28 18 12 34 18 S55 30 70 15 S95 25 110 9 S128 15 139 3" /></svg></div></article>
            <article className="admin-metric-card metric-cyan"><div className="admin-metric-top"><span>Total records</span><span className="admin-metric-icon"><Rows3 size={18} /></span></div><strong>{Number(stats.total_rows ?? 0).toLocaleString()}</strong><small><span>●</span> Rows available for analysis</small><div className="admin-sparkline"><svg viewBox="0 0 140 38" preserveAspectRatio="none"><path d="M1 32 C18 22 22 29 38 18 S58 26 75 12 S98 22 113 8 S128 14 139 2" /></svg></div></article>
            <article className="admin-metric-card metric-amber"><div className="admin-metric-top"><span>Missing values</span><span className="admin-metric-icon"><Search size={18} /></span></div><strong>{Number(stats.total_missing ?? 0).toLocaleString()}</strong><small><span>●</span> Data quality indicator</small><div className="admin-sparkline"><svg viewBox="0 0 140 38" preserveAspectRatio="none"><path d="M1 9 C18 15 20 6 37 19 S56 10 74 25 S97 12 112 22 S129 12 139 18" /></svg></div></article>
            <article className="admin-metric-card metric-rose"><div className="admin-metric-top"><span>Duplicate rows</span><span className="admin-metric-icon"><ChartNoAxesCombined size={18} /></span></div><strong>{Number(stats.total_duplicates ?? 0).toLocaleString()}</strong><small><span>●</span> Data quality indicator</small><div className="admin-sparkline"><svg viewBox="0 0 140 38" preserveAspectRatio="none"><path d="M1 28 C18 20 25 32 41 18 S61 25 77 12 S95 21 111 8 S128 17 139 5" /></svg></div></article>
          </section>

          <section className="admin-visual-grid" id="admin-analytics">
            <article className="admin-glass-panel admin-activity-panel">
              <div className="admin-panel-heading"><div><span className="admin-section-eyebrow">WORKSPACE INSIGHTS</span><h2>Data activity</h2><p>Illustrative weekly activity trend</p></div><span className="admin-chart-tag">7 DAYS</span></div>
              <div className="admin-chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={activityData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}><defs><linearGradient id="adminActivityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b75ff" stopOpacity={0.42} /><stop offset="100%" stopColor="#8b75ff" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="rgba(163,177,211,.10)" vertical={false} /><XAxis dataKey="day" tick={{ fill: "#91a0bb", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#91a0bb", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#17172b", border: "1px solid #393858", borderRadius: 12, color: "#fff" }} /><Area type="monotone" dataKey="records" stroke="#9a83ff" strokeWidth={3} fill="url(#adminActivityFill)" /></AreaChart></ResponsiveContainer></div>
            </article>
            <article className="admin-glass-panel admin-health-panel">
              <div className="admin-panel-heading"><div><span className="admin-section-eyebrow">ACCESS OVERVIEW</span><h2>User distribution</h2><p>Registered account roles</p></div><Users size={19} /></div>
              <div className="admin-role-total"><strong>{users.length}</strong><span>Total accounts</span></div>
              <div className="admin-role-bars"><div><span>Admins</span><b>{countRole("admin")}</b><i><em style={{ width: `${users.length ? countRole("admin") / users.length * 100 : 0}%` }} /></i></div><div><span>Users</span><b>{countRole("user")}</b><i><em className="bar-cyan" style={{ width: `${users.length ? countRole("user") / users.length * 100 : 0}%` }} /></i></div><div><span>Viewers</span><b>{countRole("viewer")}</b><i><em className="bar-amber" style={{ width: `${users.length ? countRole("viewer") / users.length * 100 : 0}%` }} /></i></div></div>
              <div className="admin-health-foot"><span><i /> User directory connected</span><button type="button" onClick={() => scrollToSection("User Management", "admin-users")}>Manage users <ArrowUpRight size={14} /></button></div>
            </article>
          </section>

          <section className="admin-user-section" id="admin-users">
            <div className="admin-user-heading"><div><span className="admin-section-eyebrow">ACCESS CONTROL CENTER</span><h2>User management</h2><p>Manage registered accounts, assign roles and control platform access.</p></div><button type="button" className="admin-refresh-button" onClick={loadUsers} disabled={usersLoading}>{usersLoading ? "Refreshing..." : "↻ Refresh users"}</button></div>
            <div className="admin-user-counts"><article><span>Total users</span><strong>{users.length}</strong></article><article><span>Admins</span><strong>{countRole("admin")}</strong></article><article><span>Users</span><strong>{countRole("user")}</strong></article><article><span>Viewers</span><strong>{countRole("viewer")}</strong></article></div>
            <label className="admin-user-search"><Search size={17} /><input type="search" placeholder="Search by name, username, email or role..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label>
            {usersError && <div className="admin-user-error" role="alert">{usersError}<button type="button" onClick={loadUsers}>Try again</button></div>}
            {usersLoading ? <p className="admin-user-message">Loading registered users...</p> : !usersError && filteredUsers.length === 0 ? <p className="admin-user-message">No matching users found.</p> : !usersError ? (
              <div className="admin-user-table-wrap"><table className="admin-user-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Account status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
                {filteredUsers.map((user) => { const isSelf = user.id === currentUser.id; const isProtected = user.is_staff || user.is_superuser; const isUpdating = updatingUserId === user.id; return <tr key={user.id}><td><strong>{user.full_name || user.username}</strong><small>@{user.username}</small></td><td>{user.email || "—"}</td><td><select aria-label={`Role for ${user.username}`} value={user.role} disabled={isSelf || isProtected || isUpdating} onChange={(event) => handleRoleChange(user.id, event.target.value)}><option value="admin">Admin</option><option value="user">User</option><option value="viewer">Viewer</option></select></td><td><span className={`admin-account-status ${user.is_active ? "is-active" : "is-inactive"}`}>{user.is_active ? "Active" : "Inactive"}</span></td><td>{user.date_joined ? new Date(user.date_joined).toLocaleDateString() : "—"}</td><td><button type="button" className="admin-status-button" disabled={isSelf || isProtected || isUpdating} onClick={() => handleStatusChange(user)}>{isUpdating ? "Saving..." : user.is_active ? "Deactivate" : "Activate"}</button></td></tr>; })}
              </tbody></table></div>
            ) : null}
            <p className="admin-user-note">Your own account and Django staff/superuser accounts are protected from changes here.</p>
          </section>
          <footer className="admin-footer">© {new Date().getFullYear()} Cognify Data <span>·</span> Administrator workspace <span>·</span> {currentUser.email || currentUser.username}</footer>
        </main>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting);

  // Refresh the greeting every minute so it changes while the dashboard stays open.
  useEffect(() => {
    const greetingTimer = setInterval(() => {
      setGreeting(getGreeting());
    }, 60 * 1000);

    return () => clearInterval(greetingTimer);
  }, []);

  // Authentication state
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  // Stores the dataset ID that should be opened in Analytics.
  const [selectedAnalyticsId, setSelectedAnalyticsId] = useState(null);

  const [stats, setStats] = useState({
    total_datasets: 0,
    total_rows: 0,
    total_missing: 0,
    total_duplicates: 0,
  });

  const [statsError, setStatsError] = useState("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  function refreshDashboardStats() {
    setStatsRefreshKey((previous) => previous + 1);
  }

  // Check whether a valid Django session already exists.
  useEffect(() => {
    let cancelled = false;

    async function checkAuthentication() {
      try {
        const user = await getCurrentUser();

        if (!cancelled) {
          setCurrentUser(user);
        }
      } catch (error) {
        console.error("Authentication check failed:", error);

        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    checkAuthentication();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load dashboard statistics only after authentication.
  useEffect(() => {
    if (authLoading || !currentUser) {
      return;
    }

    let cancelled = false;

    async function loadStats() {
      setStatsLoading(true);
      setStatsError("");

      try {
        // Admins load platform-wide totals from the protected admin endpoint.
        // Regular users continue to receive only their own dataset statistics.
        const userIsAdmin =
          currentUser.is_staff === true ||
          currentUser.is_superuser === true ||
          currentUser.role === "admin";

        const data = userIsAdmin
          ? await getAdminDashboardStats()
          : await getDashboardStats();

        if (!cancelled) {
          setStats({
            total_datasets: Number(data.total_datasets ?? 0),
            total_rows: Number(data.total_rows ?? 0),
            total_missing: Number(data.total_missing ?? 0),
            total_duplicates: Number(data.total_duplicates ?? 0),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatsError(
            error.message || "Unable to load dashboard statistics."
          );
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [activePage, authLoading, currentUser, statsRefreshKey]);

  function navigateTo(page) {
    setActivePage(page);
    setSidebarOpen(false);
  }

  // Opens Analytics for the specific dataset selected in Data Sources.
  function openDatasetAnalytics(datasetId) {
    setSelectedAnalyticsId(datasetId);
    navigateTo("Analytics");
  }

  // Ends the Django session and returns the user to the login screen.
  async function handleLogout() {
    const confirmation = await Swal.fire({
      title: "Log out of Cognify Data?",
      text: "Are you sure you want to end your session?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, log out",
      cancelButtonText: "Stay logged in",
      background: "#171113",
      color: "#ffffff",
      confirmButtonColor: "#9f3048",
      cancelButtonColor: "#514348",
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    try {
      await logoutUser();

      setCurrentUser(null);
      setSidebarOpen(false);
      setSelectedAnalyticsId(null);
      setActivePage("Overview");
    } catch (error) {
      console.error("Logout failed:", error);

      Swal.fire({
        icon: "error",
        title: "Logout Failed",
        text: error.message || "Unable to log out. Please try again.",
        background: "#171113",
        color: "#ffffff",
        confirmButtonColor: "#9f3048",
      });
    }
  }

  // Loading screen while checking the authentication session.
  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
        <p>Loading Cognify Data...</p>
      </div>
    );
  }

  // Public landing page and authentication screen.
  if (!currentUser) {
    if (showAuth) {
      return (
        <div className="auth-wrapper">
          <button type="button" className="auth-back-home" onClick={() => setShowAuth(false)}>
            ← Back to Home
          </button>
          <Auth
            onAuthenticated={(user) => {
              setCurrentUser(user);
              setShowAuth(false);
              setActivePage("Overview");
            }}
          />
        </div>
      );
    }

    return (
      <LandingPage
        onLogin={() => setShowAuth(true)}
        onRegister={() => setShowAuth(true)}
      />
    );
  }

  // Logged-in user details
  const displayName =
    currentUser.first_name ||
    currentUser.full_name ||
    currentUser.username ||
    "Data Explorer";

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "CD";

  // Staff and superuser accounts receive a separate admin interface.
  const isAdmin =
    currentUser.is_staff === true ||
    currentUser.is_superuser === true ||
    currentUser.role === "admin";

  if (isAdmin) {
    return (
      <AdminDashboard
        currentUser={currentUser}
        displayName={displayName}
        initials={initials}
        stats={stats}
        statsLoading={statsLoading}
        statsError={statsError}
        onRefreshStats={refreshDashboardStats}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="brand">
          <div className="brand-icon">
            <Sparkles size={22} />
          </div>

          <div>
            <h4>
              Cognify<span>Data</span>
            </h4>
            <small>AI DATA INTELLIGENCE</small>
          </div>

          <button
            type="button"
            className="close-sidebar"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <div className="workspace">
          <div className="workspace-avatar">{initials}</div>

          <div className="workspace-text">
            <strong>My Workspace</strong>
            <small>{currentUser.email || "Personal account"}</small>
          </div>
        </div>

        <div className="nav-label">PLATFORM</div>

        <nav className="sidebar-nav">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className={`nav-item ${
                activePage === label ? "active" : ""
              }`}
              aria-current={
                activePage === label ? "page" : undefined
              }
              onClick={() => navigateTo(label)}
            >
              <Icon size={18} />
              <span>{label}</span>

              {label === "Upload Data" && (
                <span className="nav-plus">+</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="profile-avatar">{initials}</div>

            <div>
              <strong>{displayName}</strong>
              <small>{currentUser.email || "Cognify Data user"}</small>
            </div>
          </div>

          <button
            type="button"
            className="nav-item logout-nav-item"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          className="mobile-overlay"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main application */}
      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Open data sources"
              onClick={() => navigateTo("Data Sources")}
            >
              <Search size={19} />
            </button>

            <button
              type="button"
              className="icon-button notification"
              aria-label="Open reports"
              onClick={() => navigateTo("Reports")}
            >
              <Bell size={19} />
            </button>

            <div className="top-avatar" title={displayName}>
              {initials}
            </div>
          </div>
        </header>

        <div className="page-content">
          {/* Overview */}
          {activePage === "Overview" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="live-dot" />
                    YOUR INTELLIGENCE HUB
                  </div>

                  <h1>
                    {greeting}, <span>{displayName}.</span>
                  </h1>

                  <p>
                    Turn raw data into clear, actionable business
                    intelligence.
                  </p>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigateTo("Upload Data")}
                >
                  <Upload size={17} />
                  Upload your data
                </button>
              </section>

              {/* AI banner */}
              <section className="insight-banner">
                <div className="banner-icon">
                  <BrainCircuit size={24} />
                </div>

                <div className="banner-copy">
                  <strong>Your AI data analyst is ready</strong>
                  <p>
                    Upload a dataset to discover patterns, measure
                    performance and answer business questions.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigateTo("AI Analyst")}
                >
                  Explore AI Analyst
                  <ArrowUpRight size={16} />
                </button>
              </section>

              {/* Live statistics */}
              <section className="stats-grid">
                <article className="stat-card">
                  <div className="stat-heading">
                    <span>Datasets</span>
                    <Database size={19} />
                  </div>

                  <div className="stat-number">
                    {stats.total_datasets}
                  </div>

                  <div className="stat-foot">
                    Saved in your workspace
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-heading">
                    <span>Rows analyzed</span>
                    <Rows3 size={19} />
                  </div>

                  <div className="stat-number">
                    {stats.total_rows}
                  </div>

                  <div className="stat-foot">
                    Total rows across saved datasets
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-heading">
                    <span>Missing values</span>
                    <Sparkles size={19} />
                  </div>

                  <div className="stat-number">
                    {stats.total_missing}
                  </div>

                  <div className="stat-foot">
                    Missing values in saved datasets
                  </div>
                </article>
              </section>

              {statsError && (
                <p role="alert" className="demo-note">
                  Unable to refresh dashboard statistics. Check that
                  the Django backend is running.
                </p>
              )}

              {/* Activity chart - demo data */}
              <section className="charts-grid">
                <article className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Data activity</h3>
                      <p>Illustrative weekly activity</p>
                    </div>

                    <span className="period-label">
                      LAST 7 DAYS
                    </span>
                  </div>

                  <div className="chart-area">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={activityData}
                        margin={{
                          top: 12,
                          right: 8,
                          left: -20,
                          bottom: 0,
                        }}
                      >
                        <defs>
                          <linearGradient
                            id="activityFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#922e40"
                              stopOpacity={0.42}
                            />
                            <stop
                              offset="100%"
                              stopColor="#922e40"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>

                        <CartesianGrid
                          stroke="#38272b"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="day"
                          tickLine={false}
                          axisLine={false}
                          tick={{
                            fill: "#bcaeb1",
                            fontSize: 12,
                          }}
                        />

                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{
                            fill: "#bcaeb1",
                            fontSize: 12,
                          }}
                        />

                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#211719",
                            border: "1px solid #60313a",
                            borderRadius: 8,
                            color: "#f7f0f1",
                          }}
                          labelStyle={{ color: "#ef9aa7" }}
                        />

                        <Area
                          type="monotone"
                          dataKey="records"
                          name="Illustrative records"
                          stroke="#d66a7c"
                          strokeWidth={2.5}
                          fill="url(#activityFill)"
                          activeDot={{
                            r: 5,
                            fill: "#d66a7c",
                            stroke: "#171213",
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="panel quality-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Data quality</h3>
                      <p>Example quality breakdown</p>
                    </div>
                    <span className="quality-badge">DEMO</span>
                  </div>

                  <div className="quality-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={qualityData}
                        layout="vertical"
                        margin={{
                          top: 5,
                          right: 12,
                          left: 5,
                          bottom: 0,
                        }}
                      >
                        <CartesianGrid
                          stroke="#38272b"
                          horizontal={false}
                        />

                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tickLine={false}
                          axisLine={false}
                          tick={{
                            fill: "#bcaeb1",
                            fontSize: 11,
                          }}
                        />

                        <YAxis
                          type="category"
                          dataKey="category"
                          width={78}
                          tickLine={false}
                          axisLine={false}
                          tick={{
                            fill: "#c1b2b5",
                            fontSize: 11,
                          }}
                        />

                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#211719",
                            border: "1px solid #60313a",
                            borderRadius: 8,
                            color: "#f7f0f1",
                          }}
                        />

                        <Bar
                          dataKey="value"
                          name="Example percentage"
                          fill="#922e40"
                          radius={[0, 5, 5, 0]}
                          barSize={15}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="demo-note">
                    Sample values only — not calculated from your data.
                  </p>
                </article>
              </section>

              {/* Getting started */}
              <section className="panel empty-state">
                <div className="empty-icon">
                  <Database size={25} />
                </div>

                <div className="empty-copy">
                  <h3>Your data journey starts here</h3>
                  <p>
                    Upload a CSV, Excel or JSON file to start
                    profiling and analyzing real data.
                  </p>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigateTo("Upload Data")}
                >
                  Get started
                  <ArrowUpRight size={16} />
                </button>
              </section>
            </>
          )}

          {/* Web Scraping */}
          {activePage === "Web Scraping" && <WebScraper />}

          {/* Upload page */}
          {activePage === "Upload Data" && <UploadDataset />}

          {/* Dataset history */}
          {activePage === "Dataset History" && <DatasetHistory />}

          {/* Dataset analytics */}
          {activePage === "Analytics" && (
            <DatasetAnalytics
              initialDatasetId={selectedAnalyticsId}
            />
          )}

          {/* Data sources */}
          {activePage === "Data Sources" && (
            <DataSources
              onUpload={() => navigateTo("Upload Data")}
              onAnalytics={openDatasetAnalytics}
            />
          )}

          {/* AI-powered natural-language dataset analysis */}
          {activePage === "AI Analyst" && <AIDataAnalyst />}

          {/* AI Report Generator: dashboard, PowerPoint, PDF and Excel exports */}
          {activePage === "Reports" && <AIReportGenerator />}

          {/* Remaining pages */}
          {![
            "Overview",
            "Upload Data",
            "Dataset History",
            "Analytics",
            "Data Sources",
            "Web Scraping",
            "AI Analyst",
            "Reports",
          ].includes(activePage) && (
            <section className="subpage panel">
              <div className="subpage-icon">
                {activePage === "AI Analyst" ? (
                  <BrainCircuit size={24} />
                ) : activePage === "Reports" ? (
                  <FileText size={24} />
                ) : (
                  <ShieldCheck size={24} />
                )}
              </div>

              <h1>{activePage}</h1>

              <p>
                {activePage === "AI Analyst"
                  ? "Your AI analyst will answer business questions using evidence from uploaded datasets. AI integration is a future development stage."
                  : activePage === "Reports"
                  ? "Generate business intelligence reports from analyzed datasets."
                  : "Explore your Cognify Data workspace."}
              </p>

              <button
                type="button"
                className="primary-button"
                onClick={() => navigateTo("Upload Data")}
              >
                <Upload size={16} />
                Upload a dataset
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => navigateTo("Overview")}
              >
                Back to overview
              </button>
            </section>
          )}

          {/* Footer */}
          <footer className="page-footer">
            Cognify Data <span>•</span> AI-powered data intelligence{" "}
            <span>•</span> Development preview
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
