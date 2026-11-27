import * as Popover from '@radix-ui/react-popover';
import {
  BarChart3,
  CalendarDays,
  FolderKanban,
  GanttChart,
  Home,
  ListTodo,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Power,
  QrCode,
  Settings,
  Sun,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const NAV_ITEMS = [
  { to: '/', label: 'ภาพรวม', icon: Home, end: true },
  { to: '/tasks', label: 'งานทั้งหมด', icon: ListTodo },
  { to: '/calendar', label: 'ปฏิทิน', icon: CalendarDays },
  { to: '/projects', label: 'โปรเจกต์', icon: FolderKanban },
  { to: '/timeline', label: 'เส้นเวลา', icon: GanttChart },
  { to: '/reports', label: 'รายงาน', icon: BarChart3 },
  { to: '/qr-generator', label: 'QR Code Generate', icon: QrCode },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { openNewTask, shutdownAppWithConfirm, isDark, toggleDark } = useApp();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('worklog-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('worklog-sidebar-collapsed', String(collapsed));
    } catch { }
  }, [collapsed]);

  // Close mobile more sheet when route changes
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const moreActive = ['/timeline', '/reports', '/qr-generator', '/settings'].some((p) =>
    location.pathname.startsWith(p),
  );

  return (
    <div className="min-h-screen lg:flex bg-ios-bg text-ios-primary">
      {/* iPadOS-Style Translucent Sidebar (Desktop ≥1024px) */}
      <aside
        className={`no-print hidden shrink-0 border-r border-ios-separator ios-sidebar-material transition-all duration-300 lg:flex lg:flex-col ${collapsed ? 'w-[76px]' : 'w-64'
          }`}
      >
        {/* Brand & Collapse Toggle */}
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-accent to-indigo-600 text-white shadow-sm ring-1 ring-white/20">
              <Workflow className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[16px] font-bold tracking-tight text-ios-primary truncate">
                  Plan<span className="text-accent">WorkFlow</span>
                </p>
                <p className="text-[10px] font-semibold text-ios-secondary uppercase tracking-wider truncate">
                  Workspace
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ios-secondary hover:bg-ios-fill hover:text-ios-primary transition"
            title={collapsed ? 'ขยายแถบเมนู' : 'ยุบแถบเมนู'}
            aria-label={collapsed ? 'ขยายแถบเมนู' : 'ยุบแถบเมนู'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Primary Action Button */}
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => openNewTask()}
            className={`btn-ios-filled w-full font-semibold shadow-sm transition-all ${collapsed ? 'px-0 justify-center h-10' : 'py-2.5'
              }`}
            title="เพิ่มงานใหม่"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            {!collapsed && <span className="ml-1 text-sm">เพิ่มงานใหม่</span>}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 px-2.5 overflow-y-auto" aria-label="เมนูหลัก">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-all ${isActive
                  ? 'bg-accent text-white shadow-sm font-semibold'
                  : 'text-ios-secondary hover:bg-ios-fill hover:text-ios-primary'
                } ${collapsed ? 'justify-center px-0' : ''}`
              }
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Sidebar Footer Controls */}
        <div className="border-t border-ios-separator p-2.5 space-y-1">
          <button
            type="button"
            onClick={toggleDark}
            className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium text-ios-secondary hover:bg-ios-fill hover:text-ios-primary transition ${collapsed ? 'justify-center px-0' : ''
              }`}
            title={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
          >
            {isDark ? (
              <Sun className="h-4 w-4 text-amber-400" strokeWidth={1.75} aria-hidden />
            ) : (
              <Moon className="h-4 w-4 text-ios-secondary" strokeWidth={1.75} aria-hidden />
            )}
            {!collapsed && <span>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</span>}
          </button>

          <button
            type="button"
            onClick={shutdownAppWithConfirm}
            className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium text-status-overdue hover:bg-status-overdue-tint transition ${collapsed ? 'justify-center px-0' : ''
              }`}
            title="ปิดโปรแกรมอย่างปลอดภัย"
            aria-label="ปิดโปรแกรมอย่างปลอดภัย"
          >
            <Power className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {!collapsed && <span>ปิดโปรแกรม</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header (Top bar) */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ios-separator ios-blur-material px-4 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-accent to-indigo-600 text-white shadow-sm ring-1 ring-white/20">
              <Workflow className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            </div>
            <span className="text-[16px] font-bold tracking-tight text-ios-primary">PlanWorkFlow</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleDark}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ios-secondary transition hover:bg-ios-fill"
              title={isDark ? 'โหมดสว่าง' : 'โหมดมืด'}
              aria-label={isDark ? 'โหมดสว่าง' : 'โหมดมืด'}
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
            <NavLink
              to="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ios-secondary transition hover:bg-ios-fill"
              aria-label="ตั้งค่า"
            >
              <Settings className="h-4 w-4" strokeWidth={1.75} />
            </NavLink>
            <button
              type="button"
              onClick={shutdownAppWithConfirm}
              className="flex h-8 w-8 items-center justify-center rounded-full text-status-overdue transition hover:bg-status-overdue-tint"
              title="ปิดโปรแกรม"
              aria-label="ปิดโปรแกรม"
            >
              <Power className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        {/* Centered Page Content Container (Max width ~1100px) */}
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Floating Action Button (Mobile Quick Add) */}
      <button
        type="button"
        onClick={() => openNewTask()}
        className="no-print fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-ios-sheet transition-transform active:scale-95 lg:hidden"
        aria-label="เพิ่มงานใหม่"
      >
        <Plus className="h-7 w-7" strokeWidth={2.2} />
      </button>

      {/* Mobile Bottom Tab Bar (Max 5 Tabs: Today, Tasks, Calendar, Projects, More) */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ios-separator ios-blur-material pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
        aria-label="แถบเมนูล่าง"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${isActive ? 'text-accent font-semibold' : 'text-ios-secondary'
            }`
          }
        >
          <Home className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span>วันนี้</span>
        </NavLink>

        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${isActive ? 'text-accent font-semibold' : 'text-ios-secondary'
            }`
          }
        >
          <ListTodo className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span>งาน</span>
        </NavLink>

        <NavLink
          to="/calendar"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${isActive ? 'text-accent font-semibold' : 'text-ios-secondary'
            }`
          }
        >
          <CalendarDays className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span>ปฏิทิน</span>
        </NavLink>

        <NavLink
          to="/projects"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${isActive ? 'text-accent font-semibold' : 'text-ios-secondary'
            }`
          }
        >
          <FolderKanban className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span>โปรเจกต์</span>
        </NavLink>

        {/* 5th Tab: More Popover */}
        <Popover.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={`flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${moreActive || moreOpen ? 'text-accent font-semibold' : 'text-ios-secondary'
                }`}
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              <span>เพิ่มเติม</span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              side="top"
              align="end"
              sideOffset={12}
              className="z-50 w-56 rounded-[16px] border border-ios-separator ios-blur-material p-1.5 shadow-ios-sheet outline-none animate-in fade-in zoom-in-95"
            >
              <div className="space-y-0.5 text-sm">
                <NavLink
                  to="/timeline"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-ios-primary hover:bg-ios-fill"
                >
                  <GanttChart className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <span>เส้นเวลา</span>
                </NavLink>

                <NavLink
                  to="/reports"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-ios-primary hover:bg-ios-fill"
                >
                  <BarChart3 className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <span>รายงาน</span>
                </NavLink>

                <NavLink
                  to="/qr-generator"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-ios-primary hover:bg-ios-fill"
                >
                  <QrCode className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <span>QR Code Generate</span>
                </NavLink>

                <NavLink
                  to="/settings"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-ios-primary hover:bg-ios-fill"
                >
                  <Settings className="h-4 w-4 text-accent" strokeWidth={1.75} />
                  <span>ตั้งค่า</span>
                </NavLink>

                <div className="my-1 h-px bg-ios-separator" />

                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    shutdownAppWithConfirm();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-status-overdue hover:bg-status-overdue-tint"
                >
                  <Power className="h-4 w-4" strokeWidth={1.75} />
                  <span>ปิดโปรแกรม</span>
                </button>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </nav>
    </div>
  );
}
