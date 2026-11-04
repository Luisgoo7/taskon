// Agenda do TaskON: busca os links .ics (pelo servidor local no PC ou pela
// função do Supabase no site), expande eventos recorrentes e calcula os feriados nacionais.
window.TaskCalendar = (() => {
  const URLS_KEY = 'taskon:calendars';
  const REFRESH_MS = 15 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const MEETING_HOSTS = [
    [/meet\.google\.com/i, 'Google Meet'],
    [/zoom\.us/i, 'Zoom'],
    [/teams\.(microsoft|live)\.com/i, 'Teams'],
    [/webex\.com/i, 'Webex'],
    [/whereby\.com/i, 'Whereby'],
  ];

  let calendars = []; // [{ isHolidayCal, events: [ICAL.Event] }]
  let lastFetch = 0;
  let error = null;
  let dayCache = new Map();

  // ---------- Links salvos ----------
  function getUrls() {
    try {
      return JSON.parse(localStorage.getItem(URLS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function setUrls(urls) {
    try {
      localStorage.setItem(URLS_KEY, JSON.stringify(urls));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    lastFetch = 0;
  }

  // ---------- Busca ----------
  async function refresh(force = false) {
    const urls = getUrls();
    if (!urls.length) {
      calendars = [];
      error = null;
      dayCache.clear();
      return;
    }
    if (!force && Date.now() - lastFetch < REFRESH_MS) return;
    if (location.protocol === 'file:' || !window.ICAL) {
      // Aberto direto do arquivo, sem servidor: não há como buscar a agenda
      error = 'Para sincronizar a agenda, abra o TaskON pelo servidor: rode "python server.py" e acesse http://localhost:5173';
      return;
    }

    const results = await Promise.allSettled(urls.map(fetchCalendar));
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = results.find((r) => r.status === 'rejected');
    // Se tudo falhar, mantém a última versão carregada
    if (ok.length || !calendars.length) calendars = ok;
    error = failed ? failed.reason.message : null;
    lastFetch = Date.now();
    dayCache.clear();
  }

  // No PC (server.py ou widget) a agenda vem do servidor local; no site, da função do Supabase
  const LOCAL_SERVER = ['localhost', '127.0.0.1'].includes(location.hostname);

  async function fetchCalendar(url) {
    const headers = { 'Content-Type': 'application/json' };
    let endpoint = '/api/ics';
    if (!LOCAL_SERVER) {
      const token = await window.TaskSync?.accessToken();
      if (!token) throw new Error('Entre na sua conta (ícone de nuvem no topo) para carregar a agenda neste aparelho.');
      endpoint = window.TaskSync.icsEndpoint;
      headers.Authorization = `Bearer ${token}`;
    }

    let res;
    try {
      res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ url }) });
    } catch {
      throw new Error(LOCAL_SERVER
        ? 'Sem conexão com o servidor do TaskON. No PC, rode "python server.py".'
        : 'Sem conexão com a internet.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível carregar a agenda.');
    }
    return parseCalendar(await res.text());
  }

  function parseCalendar(text) {
    const vcal = new ICAL.Component(ICAL.parse(text));
    vcal.getAllSubcomponents('vtimezone').forEach((tz) => ICAL.TimezoneService.register(tz));

    const masters = new Map();
    const exceptions = [];
    for (const comp of vcal.getAllSubcomponents('vevent')) {
      const ev = new ICAL.Event(comp);
      if (ev.isRecurrenceException()) exceptions.push(ev);
      else masters.set(ev.uid, ev);
    }
    // Ocorrências alteradas/canceladas de eventos recorrentes
    for (const ex of exceptions) {
      const master = masters.get(ex.uid);
      if (master) master.relateException(ex);
      else masters.set(`${ex.uid}|${ex.recurrenceId}`, ex);
    }

    const name = String(vcal.getFirstPropertyValue('x-wr-calname') || '');
    return { isHolidayCal: /feriado|holiday/i.test(name), events: [...masters.values()] };
  }

  // ---------- Eventos de um dia ----------
  function occurrencesOn(ev, dayStart, dayEnd) {
    const found = [];
    const consider = (item, startTime, endTime) => {
      if (String(item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
      const allDay = startTime.isDate;
      const start = startTime.toJSDate();
      let end = endTime ? endTime.toJSDate() : start;
      if (allDay && end <= start) end = new Date(start.getTime() + DAY_MS);
      const overlaps = end > start ? start < dayEnd && end > dayStart : start >= dayStart && start < dayEnd;
      if (overlaps) found.push({ item, start, end, allDay });
    };

    if (!ev.isRecurring()) {
      consider(ev, ev.startDate, ev.endDate);
      return found;
    }

    // Exceções podem mover uma ocorrência alguns dias; uma folga de 7 dias cobre isso
    const stopAt = dayEnd.getTime() + 7 * DAY_MS;
    const it = ev.iterator();
    for (let next, guard = 0; (next = it.next()) && guard < 20000; guard++) {
      if (next.toJSDate().getTime() >= stopAt) break;
      const d = ev.getOccurrenceDetails(next);
      consider(d.item, d.startDate, d.endDate);
    }
    return found;
  }

  // Nome da plataforma de um link (ou null se for um link qualquer)
  function providerOf(url) {
    return MEETING_HOSTS.find(([re]) => re.test(url))?.[1] || null;
  }

  function findLink(comp) {
    const read = (p) => comp.getFirstPropertyValue(p);
    const urlsIn = (...props) =>
      props
        .map(read)
        .filter(Boolean)
        .join(' ')
        .match(/https?:\/\/[^\s<>"'()\]\\]+/g)
        ?.map((u) => u.replace(/[.,;]+$/, '')) || [];

    const all = urlsIn('x-google-conference', 'url', 'location', 'description');
    for (const [re, provider] of MEETING_HOSTS) {
      const url = all.find((u) => re.test(u));
      if (url) return { url, provider };
    }
    // Sem plataforma conhecida: usa um link explícito do evento (não da descrição)
    const url = urlsIn('x-google-conference', 'url', 'location')[0];
    return url ? { url, provider: null } : null;
  }

  function getDay(key) {
    if (dayCache.has(key)) return dayCache.get(key);

    const [y, m, d] = key.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d);
    const dayEnd = new Date(y, m - 1, d + 1);
    const events = [];
    const reminders = [];

    for (const cal of calendars) {
      for (const ev of cal.events) {
        for (const occ of occurrencesOn(ev, dayStart, dayEnd)) {
          const comp = occ.item.component;
          const title = String(occ.item.summary || '(Sem título)').trim();
          if (occ.allDay) {
            reminders.push({ title, holiday: cal.isHolidayCal });
            continue;
          }
          const location = String(occ.item.location || '').trim();
          events.push({
            id: `${occ.item.uid}|${occ.start.toISOString()}`,
            uid: occ.item.uid,
            title,
            start: occ.start,
            end: occ.end,
            link: findLink(comp),
            place: /^https?:\/\//i.test(location) ? '' : location,
          });
        }
      }
    }

    // Feriados nacionais, a menos que a agenda de feriados já traga o do dia
    const holiday = brazilianHolidays(y).get(key);
    if (holiday && !reminders.some((r) => r.holiday)) reminders.unshift({ title: holiday, holiday: true });

    events.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
    const result = { reminders, events };
    dayCache.set(key, result);
    return result;
  }

  // ---------- Feriados nacionais do Brasil ----------
  const holidayCache = new Map();

  function easter(year) {
    // Algoritmo de Meeus/Jones/Butcher
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function brazilianHolidays(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const pad = (n) => String(n).padStart(2, '0');
    const key = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const fromEaster = (days) => {
      const dt = easter(year);
      dt.setDate(dt.getDate() + days);
      return key(dt);
    };

    const map = new Map([
      [`${year}-01-01`, 'Confraternização Universal'],
      [fromEaster(-48), 'Carnaval'],
      [fromEaster(-47), 'Carnaval'],
      [fromEaster(-2), 'Sexta-feira Santa'],
      [`${year}-04-21`, 'Tiradentes'],
      [`${year}-05-01`, 'Dia do Trabalho'],
      [fromEaster(60), 'Corpus Christi'],
      [`${year}-09-07`, 'Independência do Brasil'],
      [`${year}-10-12`, 'Nossa Senhora Aparecida'],
      [`${year}-11-02`, 'Finados'],
      [`${year}-11-15`, 'Proclamação da República'],
      [`${year}-11-20`, 'Dia da Consciência Negra'],
      [`${year}-12-25`, 'Natal'],
    ]);
    holidayCache.set(year, map);
    return map;
  }

  return {
    getUrls,
    setUrls,
    refresh,
    getDay,
    providerOf,
    // Força buscar de novo na próxima atualização (ex.: links mudaram em outro aparelho)
    invalidate: () => (lastFetch = 0),
    get error() { return error; },
    get connected() { return getUrls().length > 0; },
  };
})();
