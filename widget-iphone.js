// Widget do TaskON para o iPhone (app Scriptable). O TaskON coloca a chave abaixo ao gerar o script.
const TOKEN = '__TASKON_WIDGET_TOKEN__';
const API = 'https://dabepuwjowkefhuijara.supabase.co/functions/v1/widget';
const SITE = 'https://luisgoo7.github.io/taskon/';

const C = {
  bg: new Color('#0a0f1c'),
  ink: new Color('#f1f5ff'),
  muted: new Color('#8a97b5'),
  blue: new Color('#7ea4ff'),
  danger: new Color('#f87171'),
  green: new Color('#4ade80'),
};
const family = config.widgetFamily || 'large';
const LIMITS = { small: [4, 0], medium: [4, 4], large: [7, 7] }[family] || [1, 0];

async function load() {
  const req = new Request(API);
  req.headers = { 'x-widget-token': TOKEN };
  const body = await req.loadString();
  const status = req.response.statusCode;
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Resposta inválida (${status}): ${body.slice(0, 60)}`);
  }
  if (status !== 200) throw new Error(data.error || `Erro ${status}`);
  return data;
}

function text(parent, value, size, color, weight = 'regular') {
  const t = parent.addText(value);
  t.font = weight === 'bold' ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

function title(parent, label) {
  text(parent, label.toUpperCase(), 10, C.blue, 'bold');
  parent.addSpacer(3);
}

function eventRow(parent, ev, width) {
  const row = parent.addStack();
  row.centerAlignContent();
  const time = text(row, ev.start, 12, ev.now ? C.green : C.muted, 'bold');
  time.minimumScaleFactor = 0.8;
  row.addSpacer(6);
  const name = text(row, ev.title, 13, C.ink);
  name.minimumScaleFactor = 0.8;
  if (width) row.size = new Size(width, 0);
  parent.addSpacer(3);
}

function eventsBlock(parent, data, max, width) {
  const today = data.events.filter((e) => e.day === 'hoje');
  const tomorrow = data.events.filter((e) => e.day === 'amanha');
  const reminders = data.allDay.filter((r) => r.day === 'hoje');
  let left = max;

  if (reminders.length && left > 1) {
    text(parent, reminders[0].title, 11, C.danger, 'bold');
    parent.addSpacer(3);
    left -= 1;
  }
  title(parent, 'Hoje');
  if (!today.length) {
    text(parent, data.calendarError ? 'Agenda indisponível' : 'Nada mais hoje', 12, C.muted);
    parent.addSpacer(3);
    left -= 1;
  }
  today.slice(0, left).forEach((ev) => eventRow(parent, ev, width));
  left -= Math.min(today.length, left);

  if (left > 1 && tomorrow.length) {
    parent.addSpacer(3);
    title(parent, 'Amanhã');
    tomorrow.slice(0, left - 1).forEach((ev) => eventRow(parent, ev, width));
  }
}

function tasksBlock(parent, data, max) {
  title(parent, `Pendentes (${data.taskCount})`);
  if (!data.tasks.length) text(parent, 'Tudo em dia', 12, C.muted);
  data.tasks.slice(0, max).forEach((task) => {
    const row = parent.addStack();
    row.centerAlignContent();
    text(row, task.late ? '!' : '•', 12, task.late ? C.danger : C.muted, 'bold');
    row.addSpacer(5);
    text(row, task.text, 12, C.ink).minimumScaleFactor = 0.8;
    parent.addSpacer(3);
  });
}

function lockScreen(widget, data) {
  const next = data.events[0];
  text(widget, next ? `${next.day === 'hoje' ? '' : 'Amanhã '}${next.start}` : 'TaskON', 12, Color.white(), 'bold');
  text(widget, next ? next.title : 'Sem compromissos', 13, Color.white());
}

function build(data) {
  const widget = new ListWidget();
  widget.url = SITE;
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  if (family.startsWith('accessory')) {
    lockScreen(widget, data);
    return widget;
  }
  widget.backgroundColor = C.bg;
  widget.setPadding(12, 14, 12, 14);

  const [maxEvents, maxTasks] = LIMITS;
  if (family === 'medium') {
    const columns = widget.addStack();
    const left = columns.addStack();
    left.layoutVertically();
    eventsBlock(left, data, maxEvents);
    columns.addSpacer();
    const right = columns.addStack();
    right.layoutVertically();
    right.size = new Size(130, 0);
    tasksBlock(right, data, maxTasks);
  } else {
    eventsBlock(widget, data, maxEvents);
    if (maxTasks) {
      widget.addSpacer(8);
      tasksBlock(widget, data, maxTasks);
    }
  }
  widget.addSpacer();
  return widget;
}

function failure(message) {
  const widget = new ListWidget();
  widget.url = SITE;
  widget.backgroundColor = C.bg;
  widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  text(widget, 'TaskON', 14, C.blue, 'bold');
  widget.addSpacer(4);
  text(widget, message, 12, C.muted).lineLimit = 5;
  return widget;
}

let widget;
try {
  widget = build(await load());
} catch (error) {
  widget = failure(error.message);
}
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
