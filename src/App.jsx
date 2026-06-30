import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const STORAGE_KEY = "fullfocus-state-v1";
const LEGACY_STORAGE_KEYS = ["checklist-flow-pro-state-v1", "checklist-flow-state-v1"];
const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const PIE_COLORS = ["#7c5cff", "#37d0ff", "#31d0aa", "#ffd166", "#ff6b87", "#a78bfa"];

const ideas = [
  {
    title: "Сценарии и шаблоны",
    text: "Дальше можно добавить готовые пакеты задач для спорта, работы, учёбы и личных ритуалов."
  },
  {
    title: "Финансовые лимиты",
    text: "Следующий шаг для расходов: лимиты по категориям с предупреждением при превышении бюджета."
  },
  {
    title: "Сильнее аналитика",
    text: "Можно развить приложение до прогнозов накоплений, оценки недельной дисциплины и целей месяца."
  },
  {
    title: "Синхронизация",
    text: "Если позже понадобится облако, можно подключить авторизацию и синхронизацию между устройствами."
  }
];

export default function App() {
  const [appState, setAppState] = useState(() => loadState());
  const [taskDraft, setTaskDraft] = useState({ title: "", category: "" });
  const [financeDraft, setFinanceDraft] = useState(createFinanceDraft());
  const [installPrompt, setInstallPrompt] = useState(null);
  const importInputRef = useRef(null);
  const taskTitleRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }, [appState]);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  useEffect(() => {
    setAppState((prev) => ensureState(prev));
  }, []);

  const selectedTask = useMemo(
    () => appState.tasks.find((task) => task.id === appState.ui.selectedTaskId) || null,
    [appState.tasks, appState.ui.selectedTaskId]
  );

  const taskStatsMap = useMemo(() => {
    return Object.fromEntries(appState.tasks.map((task) => [task.id, getTaskStats(task)]));
  }, [appState.tasks]);

  const selectedTaskStats = selectedTask ? taskStatsMap[selectedTask.id] : null;
  const financeSummary = useMemo(
    () => getFinanceSummary(appState.finances, appState.ui.calendarMonth),
    [appState.finances, appState.ui.calendarMonth]
  );
  const appSummary = useMemo(
    () => getAppSummary(appState.tasks, taskStatsMap, financeSummary),
    [appState.tasks, taskStatsMap, financeSummary]
  );
  const calendarDays = useMemo(
    () => buildCalendarDays(appState.ui.calendarMonth),
    [appState.ui.calendarMonth]
  );
  const taskChartData = useMemo(
    () => buildTaskChartData(appState.tasks, taskStatsMap),
    [appState.tasks, taskStatsMap]
  );
  const financeTrendData = useMemo(
    () => buildFinanceTrendData(appState.finances),
    [appState.finances]
  );
  const expensePieData = useMemo(
    () => buildExpensePieData(appState.finances, appState.ui.calendarMonth),
    [appState.finances, appState.ui.calendarMonth]
  );

  const updateState = (updater) => {
    setAppState((prev) => ensureState(typeof updater === "function" ? updater(prev) : updater));
  };

  const handleAddTask = (event) => {
    event.preventDefault();
    const title = taskDraft.title.trim();
    const category = taskDraft.category.trim();

    if (!title) {
      taskTitleRef.current?.focus();
      return;
    }

    updateState((prev) => ({
      ...prev,
      tasks: [
        {
          id: createId("task"),
          title,
          category,
          createdAt: new Date().toISOString(),
          history: {}
        },
        ...prev.tasks
      ],
      ui: {
        ...prev.ui,
        selectedTaskId: prev.ui.selectedTaskId || undefined
      }
    }));

    setTaskDraft({ title: "", category: "" });
  };

  const handleAddFinance = (event) => {
    event.preventDefault();
    const amount = Number(financeDraft.amount);

    if (!Number.isFinite(amount) || amount <= 0 || !financeDraft.date) {
      return;
    }

    updateState((prev) => ({
      ...prev,
      finances: [
        {
          id: createId("entry"),
          type: financeDraft.type,
          amount,
          category: financeDraft.category.trim() || "Без категории",
          note: financeDraft.note.trim(),
          date: financeDraft.date
        },
        ...prev.finances
      ]
    }));

    setFinanceDraft(createFinanceDraft());
  };

  const handleDeleteTask = (taskId) => {
    const task = appState.tasks.find((item) => item.id === taskId);
    if (!task || !window.confirm(`Удалить задачу "${task.title}"?`)) {
      return;
    }

    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((item) => item.id !== taskId)
    }));
  };

  const handleDeleteFinance = (entryId) => {
    updateState((prev) => ({
      ...prev,
      finances: prev.finances.filter((item) => item.id !== entryId)
    }));
  };

  const handleCycleDay = (isoDate) => {
    if (!selectedTask) {
      return;
    }

    updateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => {
        if (task.id !== selectedTask.id) {
          return task;
        }

        const current = task.history[isoDate];
        const nextHistory = { ...task.history };

        if (!current) {
          nextHistory[isoDate] = "done";
        } else if (current === "done") {
          nextHistory[isoDate] = "missed";
        } else {
          delete nextHistory[isoDate];
        }

        return { ...task, history: nextHistory };
      })
    }));
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(appState, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fullfocus-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      updateState(normalizeState(parsed));
    } catch {
      window.alert("Не удалось импортировать файл. Проверь JSON-структуру.");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const handleReset = () => {
    if (!window.confirm("Удалить все задачи, отметки и финансовые записи?")) {
      return;
    }

    updateState(createDefaultState());
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const fillDemo = () => {
    updateState(createDemoData());
  };

  const shiftMonth = (direction) => {
    const current = new Date(`${appState.ui.calendarMonth}-01T00:00:00`);
    current.setMonth(current.getMonth() + direction);

    updateState((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        calendarMonth: formatMonthKey(current)
      }
    }));
  };

  const monthLabel = capitalize(
    new Date(`${appState.ui.calendarMonth}-01T00:00:00`).toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric"
    })
  );

  return (
    <div className="page">
      <div className="bg-grid" />
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />
      <div className="standalone-header" aria-hidden="true">
        <div className="standalone-title-capsule">FullFocus</div>
      </div>

      <main className="app-shell">
        <header className="topbar reveal">
          <div className="brand">
            <div className="brand-mark">FF</div>
            <div>
              <strong>FullFocus</strong>
              <p>React + PWA версия</p>
            </div>
          </div>

          <div className="topbar-actions">
            {installPrompt ? (
              <button className="primary-btn" type="button" onClick={handleInstall}>
                Установить приложение
              </button>
            ) : null}
          </div>
        </header>

        <section className="hero reveal">
          <div className="hero-copy card premium-card">
            <span className="eyebrow">Productivity operating system</span>
            <h1>Премиальный чек-лист задач, финансов и аналитики.</h1>
            <p>
              Обновлённая версия на React: красивые графики, более глубокая математика,
              тёмный интерфейс, офлайн-режим и установка как полноценное приложение.
            </p>

            <div className="hero-actions">
              <button className="primary-btn" type="button">
                Войти
              </button>
              <button className="ghost-btn" type="button">
                Регистрация
              </button>
            </div>

            <div className="hero-badges">
              <span className="info-pill">PWA ready</span>
              <span className="info-pill">Offline cache</span>
              <span className="info-pill">Charts inside</span>
            </div>
          </div>

          <div className="card stats-card reveal">
            <div className="stats-grid">
              <MetricCard
                label="Активных задач"
                value={String(appSummary.taskCount)}
                subtext={`${appSummary.trackedDays} отмеченных дней`}
              />
              <MetricCard
                label="Баланс"
                value={formatCurrency(financeSummary.balance)}
                subtext={`${formatCurrency(financeSummary.income)} доход / ${formatCurrency(
                  financeSummary.expense
                )} расход`}
              />
              <MetricCard
                label="Дисциплина"
                value={`${appSummary.focusScore}%`}
                subtext={`${appSummary.completionRate}% выполнения задач`}
              />
              <MetricCard
                label="Лучшая серия"
                value={`${appSummary.bestStreak} дн.`}
                subtext="непрерывное выполнение"
              />
            </div>
          </div>
        </section>

        <section className="metrics-section reveal">
          <MetricCard
            label="Сегодня"
            value={`${appSummary.doneToday}/${appSummary.taskCount || 0}`}
            subtext="выполненных задач"
          />
          <MetricCard
            label="Норма сбережения"
            value={`${financeSummary.savingsRate}%`}
            subtext="от общего дохода"
          />
          <MetricCard
            label="Средний расход"
            value={formatCurrency(financeSummary.avgDailyExpense)}
            subtext="в день за текущий месяц"
          />
          <MetricCard
            label="Финансовый горизонт"
            value={financeSummary.runwayLabel}
            subtext="по текущему темпу трат"
          />
        </section>

        <section className="chart-grid reveal">
          <ChartCard
            kicker="Performance"
            title="Выполнение задач"
            description="Сравнение выполненных и пропущенных дней по каждой задаче."
          >
            {taskChartData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={taskChartData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" stroke="#90a0d5" tickLine={false} axisLine={false} />
                  <YAxis stroke="#90a0d5" tickLine={false} axisLine={false} />
                  <Tooltip content={<TooltipCard />} />
                  <Bar dataKey="done" fill="#31d0aa" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="missed" fill="#ff6b87" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Добавь задачи и отметки, чтобы увидеть график дисциплины." />
            )}
          </ChartCard>

          <ChartCard
            kicker="Finance"
            title="Тренд доходов и расходов"
            description="Динамика по последним шести месяцам помогает видеть устойчивость системы."
          >
            {financeTrendData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={financeTrendData}>
                  <defs>
                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#37d0ff" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#37d0ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff6b87" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#ff6b87" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke="#90a0d5" tickLine={false} axisLine={false} />
                  <YAxis stroke="#90a0d5" tickLine={false} axisLine={false} />
                  <Tooltip content={<TooltipCard currency />} />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#37d0ff"
                    fill="url(#incomeGradient)"
                    strokeWidth={3}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="#ff6b87"
                    fill="url(#expenseGradient)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Добавь доходы и расходы, чтобы построить тренд финансов." />
            )}
          </ChartCard>

          <ChartCard
            kicker="Categories"
            title="Структура расходов"
            description="Кольцевая диаграмма показывает, куда уходит основной бюджет в этом месяце."
          >
            {expensePieData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={expensePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={102}
                    paddingAngle={4}
                  >
                    {expensePieData.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipCard currency />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="Когда появятся расходы, здесь будет диаграмма категорий." />
            )}

            {expensePieData.length ? (
              <div className="pie-legend">
                {expensePieData.map((entry, index) => (
                  <span key={entry.name}>
                    <i
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      aria-hidden="true"
                    />
                    {entry.name}
                  </span>
                ))}
              </div>
            ) : null}
          </ChartCard>
        </section>

        <section className="content-grid reveal">
          <div className="card panel">
            <PanelHeader
              kicker="Tasks"
              title="Новая задача"
              aside={<span className="badge">{appState.tasks.length} задач</span>}
            />

            <form className="form-grid" onSubmit={handleAddTask}>
              <label>
                <span>Название</span>
                <input
                  ref={taskTitleRef}
                  type="text"
                  value={taskDraft.title}
                  onChange={(event) =>
                    setTaskDraft((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Например: Тренировка"
                  maxLength={80}
                />
              </label>

              <label>
                <span>Категория</span>
                <input
                  type="text"
                  value={taskDraft.category}
                  onChange={(event) =>
                    setTaskDraft((prev) => ({ ...prev, category: event.target.value }))
                  }
                  placeholder="Здоровье, работа, учёба"
                  maxLength={40}
                />
              </label>

              <button className="primary-btn wide-btn" type="submit">
                Сохранить задачу
              </button>
            </form>

            <div className="insight-card">
              <strong>Математический вывод</strong>
              <p>{buildInsightText(appSummary, selectedTask, selectedTaskStats)}</p>
            </div>

            <div className="task-list">
              {appState.tasks.length ? (
                appState.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    stats={taskStatsMap[task.id]}
                    active={task.id === appState.ui.selectedTaskId}
                    onSelect={() =>
                      updateState((prev) => ({
                        ...prev,
                        ui: { ...prev.ui, selectedTaskId: task.id }
                      }))
                    }
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))
              ) : (
                <div className="empty-state">
                  Пока задач нет. Добавь первую привычку или рабочую цель.
                </div>
              )}
            </div>
          </div>

          <div className="card panel">
            <PanelHeader
              kicker="Calendar"
              title="Календарь выполнения"
              aside={
                <div className="calendar-nav">
                  <button className="icon-btn" type="button" onClick={() => shiftMonth(-1)}>
                    ←
                  </button>
                  <span>{monthLabel}</span>
                  <button className="icon-btn" type="button" onClick={() => shiftMonth(1)}>
                    →
                  </button>
                </div>
              }
            />

            <div className="selected-task">
              {selectedTask ? (
                <>
                  Сейчас редактируется: <strong>{selectedTask.title}</strong>. Клик по дню
                  переключает статус: выполнено, не выполнено, пусто.
                </>
              ) : (
                "Сначала добавь и выбери задачу, затем отмечай выполнение по дням."
              )}
            </div>

            <div className="legend">
              <span>
                <i className="legend-dot done" /> Выполнено
              </span>
              <span>
                <i className="legend-dot missed" /> Не выполнено
              </span>
              <span>
                <i className="legend-dot empty" /> Не отмечено
              </span>
            </div>

            <div className="calendar-grid weekdays">
              {WEEK_DAYS.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            <div className="calendar-grid">
              {selectedTask ? (
                calendarDays.map((day) => {
                  const status = selectedTask.history[day.iso] || "";

                  return (
                    <button
                      key={day.iso}
                      type="button"
                      className={`calendar-day ${day.inCurrentMonth ? "" : "other-month"} ${status} ${
                        day.iso === todayISO() ? "today" : ""
                      }`}
                      onClick={() => handleCycleDay(day.iso)}
                    >
                      {day.day}
                    </button>
                  );
                })
              ) : (
                <div className="empty-state full-span">
                  Календарь активируется после создания первой задачи.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="content-grid reveal">
          <div className="card panel">
            <PanelHeader kicker="Finance" title="Доходы и расходы" />

            <form className="form-grid finance-form" onSubmit={handleAddFinance}>
              <label>
                <span>Тип</span>
                <select
                  value={financeDraft.type}
                  onChange={(event) =>
                    setFinanceDraft((prev) => ({ ...prev, type: event.target.value }))
                  }
                >
                  <option value="income">Доход</option>
                  <option value="expense">Расход</option>
                </select>
              </label>

              <label>
                <span>Сумма</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={financeDraft.amount}
                  onChange={(event) =>
                    setFinanceDraft((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  placeholder="0"
                />
              </label>

              <label>
                <span>Категория</span>
                <input
                  type="text"
                  value={financeDraft.category}
                  onChange={(event) =>
                    setFinanceDraft((prev) => ({ ...prev, category: event.target.value }))
                  }
                  placeholder="Зарплата, еда, транспорт"
                />
              </label>

              <label>
                <span>Дата</span>
                <input
                  type="date"
                  value={financeDraft.date}
                  onChange={(event) =>
                    setFinanceDraft((prev) => ({ ...prev, date: event.target.value }))
                  }
                />
              </label>

              <label className="wide-btn">
                <span>Комментарий</span>
                <input
                  type="text"
                  value={financeDraft.note}
                  onChange={(event) =>
                    setFinanceDraft((prev) => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="Короткая заметка"
                  maxLength={100}
                />
              </label>

              <button className="primary-btn wide-btn" type="submit">
                Добавить запись
              </button>
            </form>
          </div>

          <div className="card panel">
            <PanelHeader
              kicker="Ledger"
              title="Журнал операций"
              aside={
                <span className="badge">
                  {financeSummary.incomeEntries + financeSummary.expenseEntries} записей
                </span>
              }
            />

            <div className="finance-metrics">
              <MetricCard
                label="Доход"
                value={formatCurrency(financeSummary.income)}
                subtext={`${financeSummary.incomeEntries} записей`}
              />
              <MetricCard
                label="Расход"
                value={formatCurrency(financeSummary.expense)}
                subtext={`${financeSummary.expenseEntries} записей`}
              />
            </div>

            <div className="timeline-list">
              {appState.finances.length ? (
                [...appState.finances]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((entry) => (
                    <FinanceRow
                      key={entry.id}
                      entry={entry}
                      onDelete={() => handleDeleteFinance(entry.id)}
                    />
                  ))
              ) : (
                <div className="empty-state">
                  Здесь появятся финансовые записи и их история.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card panel reveal">
          <PanelHeader
            kicker="System"
            title="Гибкость, офлайн и управление данными"
            aside={
              <div className="data-actions">
                <button className="ghost-btn" type="button" onClick={handleExport}>
                  Экспорт
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                >
                  Импорт
                </button>
                <button className="ghost-btn" type="button" onClick={handleReset}>
                  Сбросить
                </button>
              </div>
            }
          />

          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImport}
          />

          <div className="pwa-banner">
            <div>
              <strong>Офлайн-режим активирован</strong>
              <p>
                Статические ресурсы кэшируются сервис-воркером, а данные пользователя
                хранятся локально в браузере.
              </p>
            </div>
            {installPrompt ? (
              <button className="primary-btn" type="button" onClick={handleInstall}>
                Установить PWA
              </button>
            ) : (
              <span className="badge subtle-badge">Можно работать без сети</span>
            )}
          </div>

          <div className="ideas-grid">
            {ideas.map((idea) => (
              <article className="idea-item" key={idea.title}>
                <h3>{idea.title}</h3>
                <p>{idea.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function PanelHeader({ kicker, title, aside }) {
  return (
    <div className="panel-head">
      <div>
        <span className="panel-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

function MetricCard({ label, value, subtext }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-sub">{subtext}</span>
    </article>
  );
}

function ChartCard({ kicker, title, description, children }) {
  return (
    <article className="card chart-card">
      <div className="panel-head compact-head">
        <div>
          <span className="panel-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <p className="chart-description">{description}</p>
      {children}
    </article>
  );
}

function EmptyChart({ text }) {
  return <div className="empty-chart">{text}</div>;
}

function TooltipCard({ active, payload, label, currency = false }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="tooltip-card">
      {label ? <strong>{label}</strong> : null}
      {payload.map((item) => (
        <div key={`${item.name}-${item.dataKey}`} className="tooltip-line">
          <span>{item.name}</span>
          <span>{currency ? formatCurrency(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task, stats, active, onSelect, onDelete }) {
  return (
    <article className={`task-item ${active ? "active" : ""}`}>
      <button className="task-main" type="button" onClick={onSelect}>
        <div>
          <h3>{task.title}</h3>
          <p className="task-meta">
            {task.category || "Без категории"} · Серия {stats.currentStreak} · Лучшая{" "}
            {stats.bestStreak}
          </p>
        </div>
        <div className="task-stats">
          <strong>{stats.completionRate}%</strong>
          <span>
            {stats.doneCount} / {stats.doneCount + stats.missedCount} дней
          </span>
        </div>
      </button>
      <button className="delete-btn" type="button" onClick={onDelete}>
        Удалить
      </button>
    </article>
  );
}

function FinanceRow({ entry, onDelete }) {
  return (
    <article className="timeline-item">
      <div>
        <strong className="timeline-title">
          {entry.category || "Без категории"} · {entry.type === "income" ? "Доход" : "Расход"}
        </strong>
        <p className="timeline-note">{entry.note || "Без комментария"}</p>
      </div>
      <div className="timeline-side">
        <span className={`timeline-amount ${entry.type}`}>
          {entry.type === "income" ? "+" : "-"}
          {formatCurrency(entry.amount)}
        </span>
        <time className="timeline-date">
          {new Date(`${entry.date}T00:00:00`).toLocaleDateString("ru-RU")}
        </time>
        <button className="delete-btn timeline-delete" type="button" onClick={onDelete}>
          Удалить
        </button>
      </div>
    </article>
  );
}

function loadState() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ||
      "";
    return raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

function createDefaultState() {
  return {
    tasks: [],
    finances: [],
    ui: {
      selectedTaskId: null,
      calendarMonth: currentMonthKey()
    }
  };
}

function ensureState(state) {
  const normalized = normalizeState(state);
  const selectedExists = normalized.tasks.some((task) => task.id === normalized.ui.selectedTaskId);

  return {
    ...normalized,
    ui: {
      ...normalized.ui,
      selectedTaskId: selectedExists ? normalized.ui.selectedTaskId : normalized.tasks[0]?.id || null
    }
  };
}

function normalizeState(input) {
  const base = createDefaultState();

  const tasks = Array.isArray(input?.tasks)
    ? input.tasks.map((task) => ({
        id: String(task.id || createId("task")),
        title: String(task.title || "Без названия"),
        category: String(task.category || ""),
        createdAt: String(task.createdAt || new Date().toISOString()),
        history:
          typeof task.history === "object" && task.history
            ? Object.fromEntries(
                Object.entries(task.history).filter(([, value]) =>
                  ["done", "missed"].includes(value)
                )
              )
            : {}
      }))
    : [];

  const finances = Array.isArray(input?.finances)
    ? input.finances
        .filter((entry) => Number.isFinite(Number(entry.amount)))
        .map((entry) => ({
          id: String(entry.id || createId("entry")),
          type: entry.type === "expense" ? "expense" : "income",
          amount: Number(entry.amount),
          category: String(entry.category || "Без категории"),
          note: String(entry.note || ""),
          date: String(entry.date || todayISO())
        }))
    : [];

  return {
    tasks,
    finances,
    ui: {
      selectedTaskId: input?.ui?.selectedTaskId || base.ui.selectedTaskId,
      calendarMonth: input?.ui?.calendarMonth || base.ui.calendarMonth
    }
  };
}

function createFinanceDraft() {
  return {
    type: "income",
    amount: "",
    category: "",
    date: todayISO(),
    note: ""
  };
}

function createDemoData() {
  const currentMonth = currentMonthKey();
  const recentDays = Array.from({ length: 8 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return toISODate(date);
  }).reverse();

  return ensureState({
    tasks: [
      {
        id: "task-demo-training",
        title: "Тренировка",
        category: "Здоровье",
        createdAt: new Date().toISOString(),
        history: Object.fromEntries(
          recentDays.map((day, index) => [day, index === 2 ? "missed" : "done"])
        )
      },
      {
        id: "task-demo-english",
        title: "Английский 30 минут",
        category: "Учёба",
        createdAt: new Date().toISOString(),
        history: Object.fromEntries(
          recentDays.map((day, index) => [day, index % 3 === 0 ? "missed" : "done"])
        )
      },
      {
        id: "task-demo-deepwork",
        title: "Глубокая работа",
        category: "Работа",
        createdAt: new Date().toISOString(),
        history: Object.fromEntries(
          recentDays.map((day, index) => [day, index % 4 === 0 ? "missed" : "done"])
        )
      }
    ],
    finances: [
      {
        id: "entry-demo-income-1",
        type: "income",
        amount: 98000,
        category: "Зарплата",
        note: "Основной доход",
        date: `${currentMonth}-01`
      },
      {
        id: "entry-demo-income-2",
        type: "income",
        amount: 12000,
        category: "Фриланс",
        note: "Дополнительный проект",
        date: `${currentMonth}-08`
      },
      {
        id: "entry-demo-expense-1",
        type: "expense",
        amount: 4300,
        category: "Еда",
        note: "Продукты и кофе",
        date: `${currentMonth}-03`
      },
      {
        id: "entry-demo-expense-2",
        type: "expense",
        amount: 2100,
        category: "Транспорт",
        note: "Метро и такси",
        date: `${currentMonth}-05`
      },
      {
        id: "entry-demo-expense-3",
        type: "expense",
        amount: 6500,
        category: "Подписки",
        note: "Инструменты и сервисы",
        date: `${currentMonth}-11`
      },
      {
        id: "entry-demo-expense-4",
        type: "expense",
        amount: 3900,
        category: "Спорт",
        note: "Абонемент",
        date: `${currentMonth}-14`
      }
    ],
    ui: {
      selectedTaskId: "task-demo-training",
      calendarMonth: currentMonth
    }
  });
}

function getTaskStats(task) {
  const entries = Object.entries(task.history || {}).sort(([a], [b]) => a.localeCompare(b));
  const doneDates = entries.filter(([, status]) => status === "done").map(([date]) => date);
  const doneCount = doneDates.length;
  const missedCount = entries.filter(([, status]) => status === "missed").length;
  const total = doneCount + missedCount;

  return {
    doneCount,
    missedCount,
    completionRate: total ? Math.round((doneCount / total) * 100) : 0,
    currentStreak: getCurrentStreak(doneDates),
    bestStreak: getBestStreak(doneDates)
  };
}

function getFinanceSummary(finances, monthKey) {
  const incomeEntries = finances.filter((entry) => entry.type === "income");
  const expenseEntries = finances.filter((entry) => entry.type === "expense");
  const income = sumAmounts(incomeEntries);
  const expense = sumAmounts(expenseEntries);
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;

  const monthExpense = sumAmounts(
    expenseEntries.filter((entry) => String(entry.date).startsWith(monthKey))
  );
  const elapsedDays = Math.max(1, new Date().getDate());
  const avgDailyExpense = Math.round((monthExpense / elapsedDays) * 100) / 100;
  const runwayDays = avgDailyExpense > 0 && balance > 0 ? Math.floor(balance / avgDailyExpense) : 0;

  return {
    income,
    expense,
    balance,
    savingsRate,
    avgDailyExpense,
    runwayLabel: runwayDays > 0 ? `${runwayDays} дн.` : "нет данных",
    incomeEntries: incomeEntries.length,
    expenseEntries: expenseEntries.length
  };
}

function getAppSummary(tasks, taskStatsMap, financeSummary) {
  const stats = tasks.map((task) => taskStatsMap[task.id] || getTaskStats(task));
  const taskCount = tasks.length;
  const totalDone = stats.reduce((sum, item) => sum + item.doneCount, 0);
  const totalMissed = stats.reduce((sum, item) => sum + item.missedCount, 0);
  const trackedDays = totalDone + totalMissed;
  const completionRate = trackedDays ? Math.round((totalDone / trackedDays) * 100) : 0;
  const bestStreak = stats.reduce((max, item) => Math.max(max, item.bestStreak), 0);
  const doneToday = tasks.filter((task) => task.history[todayISO()] === "done").length;
  const focusScore = Math.max(
    0,
    Math.min(100, Math.round(completionRate * 0.65 + financeSummary.savingsRate * 0.35))
  );

  return {
    taskCount,
    totalDone,
    totalMissed,
    trackedDays,
    completionRate,
    bestStreak,
    doneToday,
    focusScore
  };
}

function buildInsightText(summary, selectedTask, selectedTaskStats) {
  if (!selectedTask || !selectedTaskStats) {
    return "Общий балл дисциплины объединяет выполнение задач и финансовую устойчивость. Когда появятся данные, эта зона будет показывать персональные выводы по продуктивности и деньгам.";
  }

  const performance =
    selectedTaskStats.completionRate >= 75
      ? `Задача "${selectedTask.title}" идёт уверенно: ${selectedTaskStats.completionRate}% успешных отметок.`
      : `Задача "${selectedTask.title}" проседает: ${selectedTaskStats.completionRate}% выполнения, стоит снизить трение или упростить ритм.`;

  return `${performance} Сегодня выполнено ${summary.doneToday} из ${summary.taskCount || 0} задач. Итоговый балл дисциплины системы: ${summary.focusScore}%.`;
}

function buildTaskChartData(tasks, taskStatsMap) {
  return tasks.slice(0, 6).map((task) => {
    const stats = taskStatsMap[task.id] || getTaskStats(task);
    return {
      name: shorten(task.title, 12),
      done: stats.doneCount,
      missed: stats.missedCount
    };
  });
}

function buildFinanceTrendData(finances) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return formatMonthKey(date);
  });

  return months.map((monthKey) => {
    const monthEntries = finances.filter((entry) => entry.date.startsWith(monthKey));
    return {
      label: new Date(`${monthKey}-01T00:00:00`).toLocaleDateString("ru-RU", {
        month: "short"
      }),
      income: sumAmounts(monthEntries.filter((entry) => entry.type === "income")),
      expense: sumAmounts(monthEntries.filter((entry) => entry.type === "expense"))
    };
  });
}

function buildExpensePieData(finances, monthKey) {
  const grouped = new Map();

  finances
    .filter((entry) => entry.type === "expense" && entry.date.startsWith(monthKey))
    .forEach((entry) => {
      grouped.set(entry.category, (grouped.get(entry.category) || 0) + Number(entry.amount));
    });

  return [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildCalendarDays(monthKey) {
  const monthDate = new Date(`${monthKey}-01T00:00:00`);
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(start.getDate() - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      iso: toISODate(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === monthDate.getMonth()
    };
  });
}

function getCurrentStreak(doneDates) {
  if (!doneDates.length) {
    return 0;
  }

  const sorted = [...doneDates].sort();
  let streak = 1;

  for (let index = sorted.length - 1; index > 0; index -= 1) {
    if (diffDays(sorted[index], sorted[index - 1]) === 1) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function getBestStreak(doneDates) {
  if (!doneDates.length) {
    return 0;
  }

  const sorted = [...doneDates].sort();
  let best = 1;
  let current = 1;

  for (let index = 1; index < sorted.length; index += 1) {
    if (diffDays(sorted[index], sorted[index - 1]) === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

function diffDays(left, right) {
  return Math.round(
    (new Date(`${left}T00:00:00`) - new Date(`${right}T00:00:00`)) / 86400000
  );
}

function sumAmounts(items) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayISO() {
  return toISODate(new Date());
}

function currentMonthKey() {
  return formatMonthKey(new Date());
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: Number(value) % 1 === 0 ? 0 : 2
  }).format(value || 0);
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
