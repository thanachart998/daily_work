import type { AccentColor, Category, ProjectWithStats, Settings, Task, TaskInput, ThaiFont, ThemeMode } from '@shared/schemas';
import { PowerOff } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import ConfirmDialog, { type ConfirmOptions } from '../components/ConfirmDialog';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskFormModal from '../components/TaskFormModal';
import { api } from '../lib/api';
import type { YearFormat } from '../lib/format';
import { useToast } from './ToastContext';

const THEME_STORAGE_KEY = 'worklog-theme';
const ACCENT_STORAGE_KEY = 'worklog-accent';
const FONT_STORAGE_KEY = 'worklog-thai-font';

function readInitialTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'light';
}

function readInitialAccent(): AccentColor {
  try {
    const v = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentColor;
    if (v && ['blue', 'indigo', 'purple', 'teal', 'orange'].includes(v)) return v;
  } catch {
    // ignore
  }
  return 'blue';
}

function readInitialFont(): ThaiFont {
  try {
    const v = localStorage.getItem(FONT_STORAGE_KEY) as ThaiFont;
    if (v && ['anuphan', 'noto-sans-thai', 'ibm-plex-sans-thai-looped'].includes(v)) return v;
  } catch {
    // ignore
  }
  return 'anuphan';
}

function computeIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

interface AppApi {
  settings: Settings;
  yearFormat: YearFormat;
  theme: ThemeMode;
  isDark: boolean;
  accentColor: AccentColor;
  thaiFont: ThaiFont;
  saveSettings: (s: Settings) => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
  setAccentColor: (accent: AccentColor) => Promise<void>;
  setThaiFont: (font: ThaiFont) => Promise<void>;
  toggleDark: () => Promise<void>;
  categories: Category[];
  reloadCategories: () => Promise<void>;
  projects: ProjectWithStats[];
  reloadProjects: () => Promise<void>;
  /** เพิ่มค่าเมื่อข้อมูลงานเปลี่ยน ให้หน้าต่างๆ โหลดใหม่ */
  dataVersion: number;
  notifyChanged: () => void;
  handleTaskSaved: (task: Task) => Promise<void>;
  openNewTask: (defaults?: Partial<TaskInput>) => void;
  openEditTask: (task: Task) => void;
  openTaskDetail: (task: Task) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  deleteTaskWithConfirm: (task: Task) => Promise<boolean>;
  shutdownAppWithConfirm: () => Promise<void>;
}

const Ctx = createContext<AppApi | null>(null);

type FormState = { mode: 'new'; defaults?: Partial<TaskInput> } | { mode: 'edit'; task: Task } | null;

export function AppProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings>(() => ({
    yearFormat: 'BE',
    theme: readInitialTheme(),
    accentColor: readInitialAccent(),
    thaiFont: readInitialFont(),
  }));
  const [isDark, setIsDark] = useState<boolean>(() => computeIsDark(readInitialTheme()));
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [form, setForm] = useState<FormState>(null);
  const [detail, setDetail] = useState<Task | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [stopped, setStopped] = useState(false);
  const confirmResolver = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    const apply = () => {
      const dark = computeIsDark(settings.theme);
      setIsDark(dark);
      const root = document.documentElement;
      if (dark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
      root.setAttribute('data-accent', settings.accentColor || 'blue');
      root.setAttribute('data-font', settings.thaiFont || 'anuphan');

      try {
        localStorage.setItem(THEME_STORAGE_KEY, settings.theme);
        localStorage.setItem(ACCENT_STORAGE_KEY, settings.accentColor || 'blue');
        localStorage.setItem(FONT_STORAGE_KEY, settings.thaiFont || 'anuphan');
      } catch {
        // ignore
      }
    };
    apply();

    if (settings.theme === 'system' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener?.('change', apply);
      return () => mql.removeEventListener?.('change', apply);
    }
  }, [settings.theme, settings.accentColor, settings.thaiFont]);

  const reloadCategories = useCallback(async () => {
    try {
      setCategories(await api.listCategories());
    } catch (e) {
      toast.error((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (e) {
      toast.error((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings((prev) => ({
        ...prev,
        ...s,
      }));
    }).catch(() => undefined);
    reloadCategories();
    reloadProjects();
  }, [reloadCategories, reloadProjects]);

  const notifyChanged = useCallback(() => {
    setDataVersion((v) => v + 1);
    reloadCategories();
    reloadProjects();
  }, [reloadCategories, reloadProjects]);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setConfirmState(opts);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);

  const handleTaskSaved = useCallback(
    async (task: Task) => {
      notifyChanged();
      const promptMilestone = task.promptCompleteMilestone;
      if (promptMilestone) {
        const ok = await confirm({
          title: 'งานใน Milestone เสร็จครบทุกงานแล้ว!',
          message: `งานย่อยทั้งหมดใน Milestone "${promptMilestone.title}" เสร็จเรียบร้อยแล้ว คุณต้องการเปลี่ยนสถานะ Milestone นี้เป็น "เสร็จแล้ว" ด้วยหรือไม่?`,
          confirmText: 'เปลี่ยนเป็นเสร็จแล้ว',
          cancelText: 'ยังไม่เปลี่ยน',
        });
        if (ok) {
          try {
            await api.setMilestoneStatus(promptMilestone.id, 'done');
            toast.success(`เปลี่ยนสถานะ Milestone "${promptMilestone.title}" เป็นเสร็จแล้ว`);
            notifyChanged();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }
      }
    },
    [confirm, notifyChanged, toast],
  );

  const saveSettings = async (s: Settings) => {
    setSettings(s);
    const saved = await api.updateSettings(s);
    setSettings(saved);
  };

  const setTheme = async (mode: ThemeMode) => {
    await saveSettings({ ...settings, theme: mode });
  };

  const setAccentColor = async (accent: AccentColor) => {
    await saveSettings({ ...settings, accentColor: accent });
  };

  const setThaiFont = async (font: ThaiFont) => {
    await saveSettings({ ...settings, thaiFont: font });
  };

  const toggleDark = async () => {
    const next: ThemeMode = isDark ? 'light' : 'dark';
    await setTheme(next);
  };

  const closeConfirm = (v: boolean) => {
    confirmResolver.current?.(v);
    confirmResolver.current = null;
    setConfirmState(null);
  };

  const deleteTaskWithConfirm = async (task: Task) => {
    const ok = await confirm({
      title: 'ยืนยันการลบงาน',
      message: `ต้องการลบงาน "${task.title}" ใช่หรือไม่? เมื่อลบแล้วจะไม่สามารถกู้คืนได้`,
      confirmText: 'ลบงาน',
      danger: true,
    });
    if (!ok) return false;
    try {
      await api.deleteTask(task.id);
      toast.success('ลบงานเรียบร้อยแล้ว');
      setDetail(null);
      notifyChanged();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  const shutdownAppWithConfirm = async () => {
    const ok = await confirm({
      title: 'ยืนยันการปิดโปรแกรม',
      message:
        'ต้องการปิดโปรแกรมบันทึกงานประจำวันใช่หรือไม่? ระบบจะบันทึกข้อมูลทั้งหมดลงฐานข้อมูลอย่างปลอดภัยก่อนหยุดทำงาน (เมื่อต้องการเปิดใหม่ ให้ดับเบิลคลิกไฟล์ "เปิดโปรแกรม")',
      confirmText: 'ปิดโปรแกรม',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.shutdown();
      setStopped(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (stopped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg p-4">
        <div className="ios-card max-w-md p-8 text-center shadow-ios-sheet">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-done-tint text-status-done">
            <PowerOff className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="text-xl font-bold text-ios-primary">ปิดโปรแกรมเรียบร้อยแล้ว</h1>
          <p className="mt-2 text-sm leading-relaxed text-ios-secondary">
            ระบบได้บันทึกข้อมูลทั้งหมดลงโฟลเดอร์ <code className="rounded bg-ios-fill px-1.5 py-0.5 font-mono text-xs">data/</code> และหยุดการทำงานของเซิร์ฟเวอร์อย่างปลอดภัยแล้ว
          </p>
          <p className="mt-4 rounded-xl bg-ios-fill p-3 text-xs text-ios-secondary">
            คุณสามารถปิดแท็บเบราว์เซอร์นี้ได้เลย หากต้องการใช้งานอีกครั้ง ให้ดับเบิลคลิกไฟล์ <strong>"เปิดโปรแกรม"</strong> ในโฟลเดอร์โปรแกรม
          </p>
        </div>
      </div>
    );
  }

  const value: AppApi = {
    settings,
    yearFormat: settings.yearFormat,
    theme: settings.theme,
    isDark,
    accentColor: settings.accentColor ?? 'blue',
    thaiFont: settings.thaiFont ?? 'anuphan',
    saveSettings,
    setTheme,
    setAccentColor,
    setThaiFont,
    toggleDark,
    categories,
    reloadCategories,
    projects,
    reloadProjects,
    dataVersion,
    notifyChanged,
    handleTaskSaved,
    openNewTask: (defaults) => setForm({ mode: 'new', defaults }),
    openEditTask: (task) => {
      setDetail(null);
      setForm({ mode: 'edit', task });
    },
    openTaskDetail: (task) => setDetail(task),
    confirm,
    deleteTaskWithConfirm,
    shutdownAppWithConfirm,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {form && (
        <TaskFormModal
          task={form.mode === 'edit' ? form.task : undefined}
          defaults={form.mode === 'new' ? form.defaults : undefined}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            handleTaskSaved(saved);
          }}
        />
      )}
      {detail && (
        <TaskDetailModal
          task={detail}
          onClose={() => setDetail(null)}
          onChanged={(t) => {
            setDetail(t);
            handleTaskSaved(t);
          }}
        />
      )}
      {confirmState && <ConfirmDialog {...confirmState} onResult={closeConfirm} />}
    </Ctx.Provider>
  );
}

export function useApp(): AppApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be inside AppProvider');
  return c;
}
