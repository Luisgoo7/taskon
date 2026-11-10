// Visual do widget do TaskON no iPhone (Scriptable). Carregado pelo script que fica no
// celular (widget-iphone.js), que entrega a chave em TOKEN. Mudar este arquivo muda o
// widget sem precisar colar nada de novo.
const API = 'https://dabepuwjowkefhuijara.supabase.co/functions/v1/widget';
const SITE = 'https://luisgoo7.github.io/taskon/';

const C = {
  top: new Color('#16203a'),
  bottom: new Color('#0a0f1c'),
  row: new Color('#ffffff', 0.06),
  ink: new Color('#f1f5ff'),
  text: new Color('#c9d3ea'),
  muted: new Color('#7c89a8'),
  blue: new Color('#3b74ff'),
  blueText: new Color('#8eb0ff'),
  green: new Color('#4ade80'),
  danger: new Color('#f87171'),
};
const F = {
  brand: Font.boldRoundedSystemFont(15),
  date: Font.mediumRoundedSystemFont(11),
  label: Font.boldRoundedSystemFont(10),
  time: Font.semiboldRoundedSystemFont(12),
  item: Font.mediumSystemFont(12.5),
  note: Font.mediumSystemFont(12),
};

const family = config.widgetFamily || 'large';
// [reuniões, tarefas] que cabem em cada tamanho
const LIMITS = { small: [3, 0], medium: [3, 4], large: [5, 6] }[family] || [1, 0];

async function load() {
  const req = new Request(API);
  req.headers = { 'x-widget-token': TOKEN };
  req.timeoutInterval = 20;
  const body = await req.loadString();
  const status = req.response.statusCode;
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Resposta inválida (${status})`);
  }
  if (status !== 200) throw new Error(data.error || `Erro ${status}`);
  return data;
}

// ---------- Peças ----------
function text(parent, value, font, color, lines = 1) {
  const t = parent.addText(value);
  t.font = font;
  t.textColor = color;
  t.lineLimit = lines;
  return t;
}

function symbol(parent, name, size, color) {
  const sf = SFSymbol.named(name);
  sf.applyFont(Font.mediumSystemFont(size));
  const img = parent.addImage(sf.image);
  img.imageSize = new Size(size, size);
  img.tintColor = color;
  return img;
}

function header(widget) {
  const row = widget.addStack();
  row.centerAlignContent();
  symbol(row, 'checkmark.square.fill', 17, C.blue);
  row.addSpacer(6);
  const brand = row.addStack();
  text(brand, 'Task', F.brand, C.ink);
  text(brand, 'ON', F.brand, C.blueText);
  row.addSpacer();
  if (family !== 'small') {
    const df = new DateFormatter();
    df.locale = 'pt_BR';
    df.dateFormat = "EEE, d 'de' MMM";
    text(row, df.string(new Date()), F.date, C.muted);
  }
  widget.addSpacer(10);
}

function label(parent, value, color = C.muted) {
  text(parent, value.toUpperCase(), F.label, color);
  parent.addSpacer(5);
}

function eventRow(parent, ev) {
  const row = parent.addStack();
  row.centerAlignContent();
  row.backgroundColor = C.row;
  row.cornerRadius = 8;
  row.setPadding(5, 0, 5, 8);

  const bar = row.addStack();
  bar.size = new Size(3, 16);
  bar.backgroundColor = ev.now ? C.green : C.blue;
  bar.cornerRadius = 1.5;
  row.addSpacer(7);

  const time = text(row, ev.start, F.time, ev.now ? C.green : C.blueText);
  time.minimumScaleFactor = 0.8;
  row.addSpacer(7);
  text(row, ev.title, F.item, C.ink).minimumScaleFactor = 0.85;
  row.addSpacer();
  parent.addSpacer(4);
}

function eventsBlock(parent, data, max) {
  const today = data.events.filter((e) => e.day === 'hoje');
  const tomorrow = data.events.filter((e) => e.day === 'amanha');
  const holiday = data.allDay.find((r) => r.day === 'hoje');
  let left = max;

  label(parent, 'Hoje', C.blueText);
  if (holiday) {
    const row = parent.addStack();
    row.centerAlignContent();
    symbol(row, 'flag.fill', 10, C.danger);
    row.addSpacer(5);
    text(row, holiday.title, F.note, C.danger);
    parent.addSpacer(5);
  }
  if (!today.length) {
    text(parent, data.calendarError ? 'Agenda indisponível' : 'Agenda livre', F.note, C.muted);
    parent.addSpacer(6);
  }
  today.slice(0, left).forEach((ev) => eventRow(parent, ev));
  left -= Math.min(today.length, left);

  if (left > 0 && tomorrow.length) {
    parent.addSpacer(4);
    label(parent, 'Amanhã');
    tomorrow.slice(0, left).forEach((ev) => eventRow(parent, ev));
  }
}

function tasksBlock(parent, data, max) {
  label(parent, data.taskCount ? `Pendentes · ${data.taskCount}` : 'Pendentes', C.blueText);
  if (!data.tasks.length) {
    text(parent, 'Tudo em dia', F.note, C.muted);
    return;
  }
  data.tasks.slice(0, max).forEach((task) => {
    const row = parent.addStack();
    row.centerAlignContent();
    symbol(row, task.late ? 'exclamationmark.circle.fill' : 'circle', 12, task.late ? C.danger : C.muted);
    row.addSpacer(7);
    text(row, task.text, F.item, task.late ? C.ink : C.text).minimumScaleFactor = 0.85;
    row.addSpacer();
    parent.addSpacer(5);
  });
  const rest = data.taskCount - Math.min(max, data.tasks.length);
  if (rest > 0) text(parent, `+ ${rest} ${rest === 1 ? 'tarefa' : 'tarefas'}`, F.note, C.muted);
}

// ---------- Montagem ----------
function lockScreen(data) {
  const widget = new ListWidget();
  widget.url = SITE;
  const next = data.events[0];
  text(widget, next ? `${next.day === 'hoje' ? '' : 'Amanhã '}${next.start}` : 'TaskON', Font.boldSystemFont(12), Color.white());
  text(widget, next ? next.title : 'Agenda livre', Font.systemFont(13), Color.white(), 2);
  return widget;
}

function build(data) {
  if (family.startsWith('accessory')) return lockScreen(data);
  const widget = new ListWidget();
  widget.url = SITE;
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const gradient = new LinearGradient();
  gradient.colors = [C.top, C.bottom];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;
  widget.setPadding(14, 14, 12, 14);

  header(widget);
  const [maxEvents, maxTasks] = LIMITS;
  if (family === 'medium') {
    const columns = widget.addStack();
    columns.topAlignContent();
    const left = columns.addStack();
    left.layoutVertically();
    eventsBlock(left, data, maxEvents);
    columns.addSpacer(12);
    const right = columns.addStack();
    right.layoutVertically();
    right.size = new Size(118, 0);
    tasksBlock(right, data, maxTasks);
  } else {
    eventsBlock(widget, data, maxEvents);
    if (maxTasks) {
      widget.addSpacer(6);
      tasksBlock(widget, data, maxTasks);
    }
  }
  widget.addSpacer();
  return widget;
}

function failure(message) {
  const widget = new ListWidget();
  widget.url = SITE;
  widget.backgroundColor = C.bottom;
  widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  header(widget);
  text(widget, message, F.note, C.muted, 4);
  return widget;
}

let widget;
try {
  widget = build(await load());
} catch (error) {
  widget = failure(error.message);
}
if (config.runsInWidget) Script.setWidget(widget);
else if (family === 'medium') await widget.presentMedium();
else await widget.presentLarge();
Script.complete();
