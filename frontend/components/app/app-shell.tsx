"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/lib/auth/context";

import {
  Gauge, Users, ShoppingBasket, Funnel, Phone, Headset, ChartNoAxesCombined, Settings, CircleUser,
  PhoneIncoming, BarChart3, Megaphone, Bot, Zap, ArrowDown, ArrowUp, Router, RefreshCw, Mic, CheckCircle2, BookOpen
} from "lucide-react";
import {LogOut, ArrowRightToLine, ArrowLeftToLine} from "lucide-react"

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/funnels", label: "Funnels" },
  { href: "/calls/active", label: "Calls" },
  { href: "/agents", label: "Agents" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings/integrations", label: "Settings" },
  { href: "/account", label: "Account" },
];

const activityItems = [
  { key: "dashboard", label: "Dashboard", icon: <Gauge size={24} /> },
  { key: "crm", label: "CRM", icon: <Users size={24} /> },
  { key: "products", label: "Products", icon: <ShoppingBasket size={24} /> },
  { key: "funnels", label: "Sales Funnel", icon: <Funnel size={24} /> },
  { key: "calls", label: "Calls", icon: <Phone size={24} /> },
  { key: "agents", label: "Agents", icon: <Headset size={24} /> },
  { key: "analytics", label: "Analytics", icon: <ChartNoAxesCombined size={24} /> },
];

const activityItemsBottom = [
  { key: "settings", label: "Settings", icon: <Settings size={24} /> },
  { key: "account", label: "Account", icon: <CircleUser size={24} /> },
];

const panelTabs = ["Problems", "Output", "Telemetry", "Terminal"];

const activityRouteForKey: Record<string, string> = {
  dashboard: "/",
  crm: "/customers",
  products: "/products",
  funnels: "/funnels",
  calls: "/calls/active",
  agents: "/agents",
  analytics: "/analytics",
  settings: "/settings/integrations",
  account: "/account",
};

const activitySubmenu: Record<string, { title: string; icon?: React.ReactNode; items: Array<{ label: string; icon?: React.ReactNode; href?: string }> }[]> = {
  dashboard: [
    {
      title: "Telephony & Contact Center",
      items: [
        { label: "Live Call Queue", icon: <PhoneIncoming size={16} /> },
        { label: "Call History & Analytics", icon: <BarChart3 size={16} /> },
        { label: "Active Campaigns", icon: <Megaphone size={16} /> },
      ],
    },
    {
      title: "Calling Agents",
      items: [
        { label: "Human Agents", icon: <Users size={16} />, href: "/agents?type=human" },
        { label: "AI Agents", icon: <Bot size={16} />, href: "/agents?type=ai" },
        { label: "Agent Performance", icon: <Zap size={16} />, href: "/analytics?view=agents" },
      ],
    },
    {
      title: "Customer Contact Routes",
      items: [
        { label: "Inbound Routing", icon: <ArrowDown size={16} /> },
        { label: "Outbound Campaigns", icon: <ArrowUp size={16} /> },
        { label: "IVR Configuration", icon: <Router size={16} /> },
        { label: "Call Transfers", icon: <RefreshCw size={16} /> },
      ],
    },
    {
      title: "Quality & Compliance",
      items: [
        { label: "Call Recordings", icon: <Mic size={16} /> },
        { label: "Compliance Audits", icon: <CheckCircle2 size={16} /> },
        { label: "Agent Training", icon: <BookOpen size={16} /> },
      ],
    },
  ],
  crm: [
    {
      title: "Customer Management",
      items: [
        { label: "All Customers", href: "/customers" },
        { label: "Segments", href: "/customers?view=segments" },
        { label: "Contact History", href: "/customers?view=history" },
      ],
    },
  ],
  calls: [
    {
      title: "Call Management",
      items: [
        { label: "Active Calls", href: "/calls/active" },
        { label: "Call Queue", href: "/calls/queue" },
        { label: "Call History", href: "/calls/history" },
      ],
    },
  ],
  agents: [
    {
      title: "Agent Management",
      items: [
        { label: "All Agents", href: "/agents" },
        { label: "Human Agents", href: "/agents?type=human" },
        { label: "AI Agents", href: "/agents?type=ai" },
      ],
    },
  ],
  analytics: [
    {
      title: "Analytics & Reports",
      items: [
        { label: "Dashboard Metrics", href: "/analytics" },
        { label: "Call Analytics", href: "/analytics?view=calls" },
        { label: "Agent Performance", href: "/analytics?view=agents" },
        { label: "Funnel Analytics", href: "/analytics?view=funnels" },
      ],
    },
  ],
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const [isAuxOpen, setIsAuxOpen] = useState(true);
  const [isLayoutTunerOpen, setIsLayoutTunerOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [auxWidth, setAuxWidth] = useState(360);
  const [panelHeight, setPanelHeight] = useState(220);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    root.style.setProperty("--aux-open-width", `${auxWidth}px`);
    root.style.setProperty("--panel-height", `${panelHeight}px`);
  }, [sidebarWidth, auxWidth, panelHeight]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  // Determine active activity key based on pathname
  const getActiveActivityKey = () => {
    for (const [key, route] of Object.entries(activityRouteForKey)) {
      if (pathname === route) return key;
      if (pathname.startsWith(route) && route !== "/") return key;
    }
    return "dashboard"; // default
  };

  const activeActivityKey = getActiveActivityKey();

  // Build open tabs based on current active route
  const currentNavItem = navItems.find((item) => item.href === pathname || pathname.startsWith(item.href));
  const openTabs = currentNavItem ? [currentNavItem] : [navItems[0]];

  return (
    <div className="app-shell workbench-shell">
      <header className="workbench-titlebar">
        <div className="titlebar-brand">
          <div className="titlebar-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="titlebar-product">Lead Recovery</p>
        </div>
        <div className="command-center" role="search">
          <span className="command-center-kbd">CTRL</span>
          <span className="command-center-kbd">SHIFT</span>
          <span className="command-center-kbd">P</span>
          <span className="command-center-text">Search commands, routes, and actions</span>
        </div>
        <div className="titlebar-actions">
          <p className="app-user-chip">
            {session?.user.email ?? "Guest"}
          </p>
          <button type="button" className="btn-icon shell-logout" onClick={handleLogout}>
            <LogOut size={24} />
          </button>
          <button
            type="button"
            className="btn-icon aux-toggle-button"
            onClick={() => setIsAuxOpen((prev) => !prev)}
            aria-expanded={isAuxOpen}
            aria-controls="right-auxiliary-pane"
          >
            {isAuxOpen ? <ArrowRightToLine /> : <ArrowLeftToLine />}
          </button>
        </div>
      </header>

      <div className={`workbench-main split-view-container${isAuxOpen ? " aux-open" : " aux-collapsed"}`}>
        <aside className="activity-rail split-view split-view-1" aria-label="Primary activity">
          <div className="activity-rail-group">
            {activityItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`activity-rail-button${activeActivityKey === item.key ? " is-active" : ""}`}
                aria-label={item.key}
                title={item.key}
                onClick={() => {
                  const route = activityRouteForKey[item.key];
                  if (route) router.push(route);
                }}
              >
                {item.icon ? item.icon : item.label}
              </button>
            ))}
          </div>
          <div className="activity-rail-group activity-rail-group--bottom">
            {activityItemsBottom.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`activity-rail-button${activeActivityKey === item.key ? " is-active" : ""}`}
                aria-label={item.key}
                title={item.key}
                onClick={() => {
                  const route = activityRouteForKey[item.key];
                  if (route) router.push(route);
                }}
              >
                {item.icon ? item.icon : item.label}
              </button>
            ))}
          </div>
        </aside>

        <aside className="explorer-pane split-view split-view-2" aria-label="Explorer">
          <div className="explorer-header">
            <p className="explorer-label">Explorer</p>
            <span className="explorer-meta">lead-recovery-1</span>
          </div>
          {activitySubmenu[activeActivityKey] && (
            <>
              {activitySubmenu[activeActivityKey]!.map((section, index) => (
                <div key={index} className="explorer-section">
                  <p className="explorer-section-title">{section.title}</p>
                  <ul className="explorer-list">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex}>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className={`explorer-link${pathname === item.href ? " is-active" : ""}`}
                          >
                            <span className="explorer-link-icon">{item.icon}</span>
                            <span>{item.label}</span>
                          </Link>
                        ) : (
                          <span className="explorer-link is-muted">
                            <span className="explorer-link-icon">{item.icon}</span>
                            <span>{item.label}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </aside>

        <section className="editor-stack split-view split-view-3">
          <div className="editor-tabs" role="tablist" aria-label="Open pages">
            {openTabs.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`editor-tab${pathname === item.href ? " is-active" : ""}`}
              >
                <span className="editor-tab-dot" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <div className="editor-toolbar">
            <div className="editor-breadcrumbs">
              <span>lead-recovery-1</span>
              <span>/</span>
              <span>app</span>
              <span>/</span>
              <span>{pathname === "/" ? "dashboard" : pathname.replace(/^\//, "")}</span>
            </div>
            <div className="editor-toolbar-actions">
              <span className="toolbar-chip">main</span>
              <span className="toolbar-chip">TypeScript</span>
              <span className="toolbar-chip">UTF-8</span>
            </div>
          </div>

          <main className="content-panel">
            <div className="editor-surface">{children}</div>
          </main>

          <section className="bottom-panel" aria-label="Output panels">
            <div className="bottom-panel-tabs">
              {panelTabs.map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  className={`bottom-panel-tab${index === 0 ? " is-active" : ""}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="bottom-panel-body">
              <p className="bottom-panel-line">0 errors · 0 warnings · route telemetry active</p>
              <p className="bottom-panel-line">Current view: {pathname}</p>
            </div>
          </section>
        </section>

        <aside
          id="right-auxiliary-pane"
          className={`right-auxiliary-pane split-view split-view-4${isAuxOpen ? " is-open" : " is-collapsed"}`}
          aria-label="Copilot auxiliary panel"
        >
          {isAuxOpen ? (
            <>
              <div className="right-aux-header">
                <p className="right-aux-title">Copilot Chat</p>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setIsAuxOpen(false)}
                  aria-label="Collapse auxiliary panel"
                >
                  <ArrowRightToLine size={16} />
                </button>
              </div>
              <div className="right-aux-body">
                <div className="copilot-chat-thread">
                  <p className="copilot-msg copilot-msg-assistant">How can I help with this migration phase?</p>
                  <p className="copilot-msg copilot-msg-user">Create route parity and tests for logs + integrations.</p>
                  <p className="copilot-msg copilot-msg-assistant">I can scaffold Phase 4 and wire SSE fallback with telemetry.</p>
                </div>
                <div className="copilot-chat-composer">
                  <input
                    className="field-input"
                    placeholder="Ask Copilot..."
                    aria-label="Copilot prompt"
                  />
                  <button type="button" className="btn btn-primary btn-sm">Send</button>
                </div>
              </div>
            </>
          ) : (
            <div className="right-aux-collapsed-rail">
              <button
                type="button"
                className="right-aux-expand-btn"
                onClick={() => setIsAuxOpen(true)}
                aria-label="Expand Copilot auxiliary panel"
              >
                Copilot
              </button>
            </div>
          )}
        </aside>
      </div>

      <footer className="status-bar">
        <div className="status-bar-group">
          <span className="status-item">main</span>
          <span className="status-item">Sync OK</span>
          <span className="status-item">Telemetry On</span>
        </div>
        <div className="status-bar-group">
          <button
            type="button"
            className="status-item status-item-button"
            onClick={() => setIsLayoutTunerOpen((prev) => !prev)}
            aria-expanded={isLayoutTunerOpen}
            aria-controls="layout-tuner"
          >
            Layout
          </button>
          <span className="status-item">Spaces: 2</span>
          <span className="status-item">LF</span>
          <span className="status-item">TypeScript React</span>
        </div>
      </footer>

      {isLayoutTunerOpen && (
        <section id="layout-tuner" className="layout-tuner-panel" aria-label="Layout tuning panel">
          <header className="layout-tuner-header">
            <p className="layout-tuner-title">Layout Tuner</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSidebarWidth(300);
                setAuxWidth(360);
                setPanelHeight(220);
              }}
            >
              Reset
            </button>
          </header>

          <label className="layout-tuner-field" htmlFor="sidebar-width">
            <span>Explorer Width: {sidebarWidth}px</span>
            <input
              id="sidebar-width"
              type="range"
              min={220}
              max={420}
              step={2}
              value={sidebarWidth}
              onChange={(event) => setSidebarWidth(Number(event.target.value))}
            />
          </label>

          <label className="layout-tuner-field" htmlFor="aux-width">
            <span>Auxiliary Width: {auxWidth}px</span>
            <input
              id="aux-width"
              type="range"
              min={280}
              max={520}
              step={2}
              value={auxWidth}
              onChange={(event) => setAuxWidth(Number(event.target.value))}
            />
          </label>

          <label className="layout-tuner-field" htmlFor="panel-height">
            <span>Bottom Panel Height: {panelHeight}px</span>
            <input
              id="panel-height"
              type="range"
              min={140}
              max={340}
              step={2}
              value={panelHeight}
              onChange={(event) => setPanelHeight(Number(event.target.value))}
            />
          </label>
        </section>
      )}
    </div>
  );
}
