(() => {
  const STORAGE_KEY = 'taskon:v1';
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  // Ícones de traço simples (mesmo estilo do lápis/lixeira)
  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sunset: '<path d="M12 10V3M8.5 6.5L12 3l3.5 3.5M4.2 12.2l1.4 1.4M18.4 13.6l1.4-1.4M2 18h20M7 18a5 5 0 0 1 10 0M5 22h14"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flag: '<path d="M5 21V4M5 4h12l-2.5 4.5L17 13H5"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    pin: '<path d="M19 10c0 5.5-7 11-7 11s-7-5.5-7-11a7 7 0 0 1 14 0z"/><circle cx="12" cy="10" r="2.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const PERIODS = [
    { id: 'manha', name: 'Manhã', icon: 'sun', until: 12 },
    { id: 'tarde', name: 'Tarde', icon: 'sunset', until: 18 },
    { id: 'noite', name: 'Noite', icon: 'moon', until: 24 },
  ];
  const periodOfHour = (h) => PERIODS.find((p) => h < p.until);
  const $ = (id) => document.getElementById(id);

  const els = {
    greeting: $('greeting'),
    dateText: $('dateText'),
    datePicker: $('datePicker'),
    todayBtn: $('todayBtn'),
    form: $('addForm'),
    input: $('newTask'),
    addPeriod: $('addPeriod'),
    addDay: $('addDay'),
    addDialog: $('addDialog'),
    addCancel: $('addCancel'),
    linkDialog: $('linkDialog'),
    linkForm: $('linkForm'),
    linkUrl: $('linkUrl'),
    linkEvent: $('linkEvent'),
    linkRemove: $('linkRemove'),
    linkCancel: $('linkCancel'),
    toast: $('toast'),
    syncBtn: $('syncBtn'),
    syncDialog: $('syncDialog'),
    syncForm: $('syncForm'),
    syncText: $('syncText'),
    syncEmail: $('syncEmail'),
    syncLink: $('syncLink'),
    syncNote: $('syncNote'),
    syncLogout: $('syncLogout'),
    syncClose: $('syncClose'),
    syncSubmit: $('syncSubmit'),
    syncPair: $('syncPair'),
    scanBtn: $('scanBtn'),
    scanDialog: $('scanDialog'),
    scanVideo: $('scanVideo'),
    scanNote: $('scanNote'),
    scanEmail: $('scanEmail'),
    syncQr: $('syncQr'),
    syncQrImg: $('syncQrImg'),
    fab: $('fab'),
    pendingList: $('pendingList'),
    pendingCount: $('pendingCount'),
    pendingEmpty: $('pendingEmpty'),
    doneGroup: $('doneGroup'),
    doneList: $('doneList'),
    doneCount: $('doneCount'),
    clearDone: $('clearDone'),
    tpl: $('taskTpl'),
    reminders: $('reminders'),
    agendaCount: $('agendaCount'),
    agendaSettings: $('agendaSettings'),
    agendaBody: $('agendaBody'),
    eventTpl: $('eventTpl'),
    calDialog: $('calDialog'),
    calUrls: $('calUrls'),
  };

  // ---------- Dados ----------
  // Estrutura salva: { "2026-11-04": [{ id, text, done, doneAt }] }
  const EVENTS_DONE_KEY = 'taskon:events-done';
  const EVENT_LINKS_KEY = 'taskon:event-links';
  let store = loadJSON(STORAGE_KEY);
  let eventsDone = loadJSON(EVENTS_DONE_KEY); // { "<uid>|<início>": timestamp }
  let eventLinks = loadJSON(EVENT_LINKS_KEY); // { "<uid>": link adicionado à mão }
  let currentDate = todayKey();
  let justAddedId = null;
  let composerPeriod = 'manha';
  let composerDate = currentDate;
  let linkTarget = null;
  let agendaLoaded = false;

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
      return {};
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível: segue funcionando em memória */
    }
  }

  function save() {
    // Remove dias vazios para não acumular lixo
    for (const key of Object.keys(store)) {
      if (!store[key].length) delete store[key];
    }
    saveJSON(STORAGE_KEY, store);
    TaskSync.push(STORAGE_KEY);
  }

  const tasks = () => store[currentDate] || (store[currentDate] = []);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Datas ----------
  function toKey(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey() {
    return toKey(new Date());
  }

  function shiftDay(key, delta) {
    const d = fromKey(key);
    d.setDate(d.getDate() + delta);
    return toKey(d);
  }

  // "03 de Nov de 2025"
  function dateLabel(key) {
    const d = fromKey(key);
    return `${String(d.getDate()).padStart(2, '0')} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  }

  // "06 de Nov" (sem o ano)
  function shortLabel(key) {
    return dateLabel(key).replace(/ de \d{4}$/, '');
  }

  function greeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Bom dia!';
    if (h >= 12 && h < 18) return 'Boa tarde!';
    return 'Boa noite!';
  }

  // ---------- Ações ----------
  function addTask(text) {
    text = text.trim();
    if (!text) return;
    justAddedId = uid();
    (store[composerDate] ||= []).push({ id: justAddedId, text, period: composerPeriod, done: false, doneAt: null });
    save();
    render();
    justAddedId = null;

    // Tarefa para outro dia: avisa, sem tirar você do dia que está vendo
    if (composerDate !== currentDate) {
      const when = composerDate === todayKey() ? 'hoje'
        : composerDate === shiftDay(todayKey(), 1) ? 'amanhã'
        : shortLabel(composerDate);
      showToast(`Tarefa adicionada para ${when}`);
    }
  }

  let toastTimer;
  function showToast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), 2600);
  }

  function toggleTask(id) {
    const t = tasks().find((t) => t.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    save();
    render();
  }

  function editTask(id, text, period) {
    const t = tasks().find((t) => t.id === id);
    text = text.trim();
    if (t && text && (text !== t.text || period !== t.period)) {
      t.text = text;
      t.period = period;
      save();
    }
    render();
  }

  function deleteTask(id) {
    store[currentDate] = tasks().filter((t) => t.id !== id);
    save();
    render();
  }

  function clearDone() {
    const done = tasks().filter((t) => t.done).length;
    if (!done) return;
    const msg = done === 1 ? 'Remover 1 tarefa concluída?' : `Remover ${done} tarefas concluídas?`;
    if (!confirm(msg)) return;
    store[currentDate] = tasks().filter((t) => !t.done);
    save();
    render();
  }

  function goTo(key) {
    if (!key) return;
    currentDate = key;
    render();
  }

  // ---------- Escolha de período (Manhã / Tarde / Noite) ----------
  function buildPeriodPicker(selected, onChange) {
    const group = document.createElement('div');
    group.className = 'period-picker';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Período');
    for (const p of PERIODS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.period = p.id;
      btn.setAttribute('aria-pressed', String(p.id === selected));
      btn.innerHTML = `${icon(p.icon)}${p.name}`;
      // Não tira o foco do campo de texto ao tocar no período (o teclado do celular não fecha)
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
        onChange(p.id);
      });
      group.append(btn);
    }
    return group;
  }

  // ---------- Card flutuante de nova tarefa (aberto pelo botão +) ----------
  // Período sugerido: o atual se for hoje; manhã nos outros dias
  function defaultPeriod() {
    return currentDate === todayKey() ? periodOfHour(new Date().getHours()).id : 'manha';
  }

  // Escolha do dia: Hoje / Amanhã / Outro dia (abre o calendário)
  function buildDayPicker(selected, onChange) {
    const today = todayKey();
    const tomorrow = shiftDay(today, 1);
    const group = document.createElement('div');
    group.className = 'period-picker';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Dia');

    const other = document.createElement('label');
    other.className = 'chip date-chip';
    other.innerHTML = `${icon('calendar')}<span></span><input type="date" aria-label="Escolher outro dia">`;
    const otherText = other.querySelector('span');
    const otherInput = other.querySelector('input');

    const chips = [];
    const select = (key) => {
      const isOther = key !== today && key !== tomorrow;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.day === key)));
      other.setAttribute('aria-pressed', String(isOther));
      otherText.textContent = isOther ? shortLabel(key) : 'Outro dia';
      otherInput.value = key;
      onChange(key);
    };

    for (const [key, name] of [[today, 'Hoje'], [tomorrow, 'Amanhã']]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.day = key;
      btn.textContent = name;
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        select(key);
        els.input.focus();
      });
      chips.push(btn);
    }
    otherInput.addEventListener('click', () => {
      try { otherInput.showPicker(); } catch { /* navegador sem suporte: abre pelo próprio input */ }
    });
    otherInput.addEventListener('change', () => {
      if (otherInput.value) select(otherInput.value);
      els.input.focus();
    });

    group.append(...chips, other);
    select(selected);
    return group;
  }

  function openAddDialog() {
    els.addDay.replaceWith((els.addDay = buildDayPicker(currentDate, (key) => (composerDate = key))));
    composerPeriod = defaultPeriod();
    els.addPeriod.replaceWith(
      (els.addPeriod = buildPeriodPicker(composerPeriod, (id) => {
        composerPeriod = id;
        els.input.focus();
      }))
    );
    els.input.value = '';
    els.addDialog.showModal();
    els.input.focus();
  }

  // ---------- Edição inline ----------
  function startEdit(li, task) {
    const span = li.querySelector('.text');
    const wrap = document.createElement('div');
    wrap.className = 'edit-wrap';
    const input = document.createElement('input');
    input.className = 'edit-input';
    input.value = task.text;
    input.maxLength = 200;
    input.setAttribute('aria-label', 'Editar tarefa');
    let period = task.period || defaultPeriod();
    wrap.append(input, buildPeriodPicker(period, (id) => (period = id)));
    span.replaceWith(wrap);
    li.querySelector('.actions').hidden = true;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      commit ? editTask(task.id, input.value, period) : render();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  // ---------- Agenda ----------
  // Usado nas reuniões que não têm link na agenda nem um link próprio
  const DEFAULT_MEETING_LINK = 'https://meet.google.com/home?hs=197&authuser=1';
  const fmtTime = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  async function syncCalendar(force = false) {
    await TaskCalendar.refresh(force);
    agendaLoaded = true;
    renderAgenda();
  }

  function toggleEvent(id) {
    if (eventsDone[id]) delete eventsDone[id];
    else eventsDone[id] = Date.now();
    saveJSON(EVENTS_DONE_KEY, eventsDone);
    TaskSync.push(EVENTS_DONE_KEY);
    renderAgenda();
  }

  function openCalDialog() {
    els.calUrls.value = TaskCalendar.getUrls().join('\n');
    els.calDialog.returnValue = '';
    els.calDialog.showModal();
  }

  function periodOf(ev, dayStart) {
    return periodOfHour((ev.start < dayStart ? dayStart : ev.start).getHours());
  }

  function periodSection(period, list) {
    const section = document.createElement('div');
    section.className = 'period';
    const h3 = document.createElement('h3');
    h3.className = 'period-title';
    h3.innerHTML = icon(period.icon);
    h3.append(period.name);
    section.append(h3, list);
    return section;
  }

  function message(text, className = '') {
    const p = document.createElement('p');
    p.className = `agenda-msg ${className}`;
    p.textContent = text;
    return p;
  }

  function buildReminder(r) {
    const div = document.createElement('div');
    div.className = r.holiday ? 'reminder holiday' : 'reminder';
    div.innerHTML = `
      <span class="reminder-icon">${icon(r.holiday ? 'flag' : 'bell')}</span>
      <div><span class="reminder-kind">${r.holiday ? 'Feriado' : 'Lembrete'}</span><span class="reminder-title"></span></div>`;
    div.querySelector('.reminder-title').textContent = r.title;
    return div;
  }

  function buildEvent(ev, dayStart) {
    const li = els.eventTpl.content.firstElementChild.cloneNode(true);
    const done = Boolean(eventsDone[ev.id]);
    const checkbox = li.querySelector('input');
    const now = new Date();

    li.classList.toggle('done', done);
    checkbox.checked = done;
    checkbox.setAttribute('aria-label', `${done ? 'Desmarcar' : 'Marcar como cumprido'}: ${ev.title}`);
    checkbox.addEventListener('change', () => toggleEvent(ev.id));

    // Início e fim separados: no celular ficam um embaixo do outro
    const [start, end] = ev.start < dayStart
      ? ['Até', fmtTime(ev.end)]
      : [fmtTime(ev.start), ev.end > ev.start ? fmtTime(ev.end) : ''];
    li.querySelector('.time-start').textContent = start;
    li.querySelector('.time-end').textContent = end;
    li.querySelector('.time-end').hidden = !end;
    li.querySelector('.now').hidden = done || !(ev.start <= now && now < ev.end);
    li.querySelector('.event-title').textContent = ev.title;

    // Link da agenda → link colocado à mão → Meet padrão (só para reuniões; aulas ficam sem botão)
    const custom = eventLinks[ev.uid];
    const link = ev.link
      || (custom && { url: custom, provider: TaskCalendar.providerOf(custom) })
      || (ev.meeting && { url: DEFAULT_MEETING_LINK, provider: 'Google Meet' });
    const join = li.querySelector('.join');
    join.hidden = !link;
    if (link) {
      join.href = link.url;
      join.querySelector('.join-label').textContent = link.provider ? `Entrar no ${link.provider}` : 'Abrir link';
      // Versão curta para o celular ("Meet", "Zoom", "Teams"...)
      join.querySelector('.join-short').textContent = link.provider ? link.provider.replace('Google ', '') : 'Abrir';
    }
    // Sem link próprio na agenda: o lápis permite trocar pelo link certo da reunião
    const editLink = li.querySelector('.edit-link');
    editLink.hidden = Boolean(ev.link) || !link;
    editLink.addEventListener('click', () => openLinkDialog(ev));

    const place = li.querySelector('.place');
    if (ev.place) {
      place.innerHTML = icon('pin');
      place.append(ev.place);
      place.hidden = false;
    }
    li.querySelector('.event-meta').hidden = !link && !ev.place;
    return li;
  }

  function openLinkDialog(ev) {
    linkTarget = ev.uid;
    els.linkEvent.textContent = ev.title;
    els.linkUrl.value = eventLinks[ev.uid] || '';
    els.linkRemove.hidden = !eventLinks[ev.uid];
    els.linkDialog.showModal();
    els.linkUrl.focus();
  }

  function saveEventLink(url) {
    if (url) eventLinks[linkTarget] = url;
    else delete eventLinks[linkTarget];
    saveJSON(EVENT_LINKS_KEY, eventLinks);
    TaskSync.push(EVENT_LINKS_KEY);
    renderAgenda();
  }

  function renderAgenda() {
    const { reminders, events } = TaskCalendar.getDay(currentDate);
    els.reminders.replaceChildren(...reminders.map(buildReminder));

    if (!TaskCalendar.connected) {
      const cta = document.createElement('div');
      cta.className = 'agenda-cta';
      cta.innerHTML = '<span>Veja suas reuniões aqui, separadas por manhã, tarde e noite.</span>';
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = 'Conectar agenda';
      btn.addEventListener('click', openCalDialog);
      cta.append(btn);
      els.agendaBody.replaceChildren(cta);
      els.agendaCount.hidden = true;
      return;
    }

    const parts = [];
    if (TaskCalendar.error) parts.push(message(TaskCalendar.error, 'error'));
    if (!agendaLoaded) parts.push(message('Carregando agenda...'));
    else if (!events.length && !TaskCalendar.error) parts.push(message('Nenhum compromisso neste dia.'));

    const dayStart = fromKey(currentDate);
    for (const period of PERIODS) {
      const list = events.filter((ev) => periodOf(ev, dayStart) === period);
      if (!list.length) continue;
      const ul = document.createElement('ul');
      ul.className = 'events';
      ul.append(...list.map((ev) => buildEvent(ev, dayStart)));
      parts.push(periodSection(period, ul));
    }

    els.agendaCount.hidden = !events.length;
    els.agendaCount.textContent = events.filter((ev) => !eventsDone[ev.id]).length;
    els.agendaBody.replaceChildren(...parts);
  }

  // ---------- Sincronização entre aparelhos ----------
  // O e-mail traz um link de acesso: tocar nele abre o site já logado; no widget,
  // o link é colado aqui e validado sem precisar abrir o navegador.
  let syncStep = 'email'; // email -> link
  // No widget, o link do e-mail volta para o próprio widget (página /auth do servidor dele)
  const IN_WIDGET = location.hostname === '127.0.0.1' && location.port === '5180';

  function syncMessage(text, isError = false) {
    els.syncNote.hidden = !text;
    els.syncNote.textContent = text || '';
    els.syncNote.classList.toggle('error', isError);
  }

  function renderSyncDialog() {
    const user = TaskSync.user;
    const unavailable = TaskSync.status === 'unavailable';
    els.syncEmail.hidden = Boolean(user) || unavailable || syncStep === 'link';
    // No widget o link conecta sozinho; colar fica só para o site
    els.syncLink.hidden = Boolean(user) || unavailable || syncStep !== 'link' || IN_WIDGET;
    els.syncSubmit.hidden = Boolean(user) || unavailable || (syncStep === 'link' && IN_WIDGET);
    els.syncSubmit.textContent = syncStep === 'link' ? 'Entrar' : 'Enviar link';
    els.syncLogout.hidden = !user;
    els.syncPair.hidden = !user;
    if (!user) els.syncQr.hidden = true;
    els.syncText.textContent = user
      ? `Conectado como ${user.email}. Tudo o que você fizer aqui aparece no computador, no celular e no site.`
      : unavailable
        ? 'Sem conexão com o serviço de sincronização. Verifique a internet e abra o TaskON de novo.'
        : syncStep === 'link'
          ? IN_WIDGET
            ? `Enviamos um e-mail para ${els.syncEmail.value.trim()}. Abra o e-mail aqui no PC e clique em "Sign in": o widget conecta sozinho.`
            : `Enviamos um e-mail para ${els.syncEmail.value.trim()}. Toque em "Sign in" no e-mail e pronto. Se abriu o e-mail em outro aparelho, copie o link e cole abaixo.`
          : 'Entre com seu e-mail para ver as mesmas tarefas e a mesma agenda no computador, no celular e no site.';
  }

  function openSyncDialog() {
    syncStep = 'email';
    els.syncLink.value = '';
    els.syncQr.hidden = true;
    syncMessage('');
    renderSyncDialog();
    els.syncDialog.showModal();
    (TaskSync.user ? els.syncClose : els.syncEmail).focus();
  }

  async function submitSync() {
    const email = els.syncEmail.value.trim();
    if (syncStep === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(email)) return syncMessage('Digite um e-mail válido.', true);
      const { error } = await TaskSync.sendCode(email, IN_WIDGET ? `${location.origin}/auth` : undefined);
      if (error) {
        return syncMessage(error.status === 429
          ? 'Limite de e-mails atingido. Espere um pouco ou, no TaskON do PC já conectado, use "Conectar celular" e leia o QR code.'
          : `Não foi possível enviar o e-mail: ${error.message}`, true);
      }
      syncStep = 'link';
      syncMessage('');
      renderSyncDialog();
      els.syncLink.focus();
    } else {
      let link;
      try {
        link = new URL(els.syncLink.value.trim());
      } catch {
        return syncMessage('Cole o link completo do e-mail (começa com https://).', true);
      }
      const tokenHash = link.searchParams.get('token');
      if (!tokenHash) return syncMessage('Esse não parece ser o link do e-mail do TaskON.', true);
      const { error } = await TaskSync.verifyLink(tokenHash, link.searchParams.get('type') || 'magiclink');
      if (error) {
        return syncMessage('Link inválido ou já usado (cada link funciona uma vez). Peça outro e cole sem abrir.', true);
      }
      els.syncDialog.close();
      showToast('Sincronização ativada');
    }
  }

  // Bibliotecas de QR code só carregam quando forem usadas
  function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('sem conexão'));
      document.head.append(script);
    });
  }

  // Conectar outro aparelho: QR code com um link de acesso de uso único
  async function showPairingQr() {
    els.syncPair.disabled = true;
    syncMessage('Gerando o código...');
    try {
      const [link] = await Promise.all([
        TaskSync.deviceLink(),
        loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', 'qrcode'),
      ]);
      const qr = window.qrcode(0, 'M');
      qr.addData(link);
      qr.make();
      els.syncQrImg.src = qr.createDataURL(6, 0);
      els.syncQr.hidden = false;
      syncMessage('Aponte a câmera do celular para o código e toque no link que aparecer. Ele funciona uma vez só e vale por 1 hora.');
    } catch (error) {
      syncMessage(`Não foi possível gerar o código: ${error.message}`, true);
    } finally {
      els.syncPair.disabled = false;
    }
  }

  // ---------- Ler o QR code dentro do app (celular) ----------
  // O app da Tela de Início do iPhone não compartilha login com o Safari,
  // então o QR code precisa ser lido aqui dentro, e não pela câmera do sistema.
  const TOUCH = matchMedia('(hover: none)').matches;
  const scanCanvas = document.createElement('canvas');
  let scanStream = null;
  let scanFrame = 0;

  function scanMessage(text, isError = false) {
    els.scanNote.hidden = !text;
    els.scanNote.textContent = text || '';
    els.scanNote.classList.toggle('error', isError);
  }

  function openScanner() {
    scanMessage('');
    els.scanDialog.showModal();
    startCamera();
  }

  async function startCamera() {
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', 'jsQR');
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      els.scanVideo.srcObject = scanStream;
      await els.scanVideo.play();
      scanLoop();
    } catch (error) {
      scanMessage(error.name === 'NotAllowedError'
        ? 'Permita o acesso à câmera para ler o código (Ajustes do celular, se precisar).'
        : `Não foi possível abrir a câmera: ${error.message}`, true);
    }
  }

  function stopCamera() {
    cancelAnimationFrame(scanFrame);
    scanStream?.getTracks().forEach((track) => track.stop());
    scanStream = null;
    els.scanVideo.srcObject = null;
  }

  function scanLoop() {
    if (!scanStream) return;
    const video = els.scanVideo;
    if (video.readyState >= 2 && video.videoWidth) {
      const scale = Math.min(1, 640 / video.videoWidth);
      scanCanvas.width = Math.round(video.videoWidth * scale);
      scanCanvas.height = Math.round(video.videoHeight * scale);
      const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
      const image = ctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) return handleScanned(code.data);
    }
    scanFrame = requestAnimationFrame(scanLoop);
  }

  async function handleScanned(text) {
    let tokenHash = null;
    let type = 'magiclink';
    try {
      const url = new URL(text);
      tokenHash = url.searchParams.get('token');
      type = url.searchParams.get('type') || type;
    } catch {
      /* não é um link */
    }
    if (!tokenHash) {
      scanMessage('Esse QR code não é do TaskON. Aponte para o código do widget.', true);
      scanFrame = requestAnimationFrame(scanLoop);
      return;
    }
    stopCamera();
    scanMessage('Conectando...');
    const { error } = await TaskSync.verifyLink(tokenHash, type);
    if (error) {
      scanMessage('Esse código já foi usado ou expirou. Gere outro no PC e leia de novo.', true);
      return startCamera();
    }
    els.scanDialog.close();
    showToast('Aparelho conectado');
  }

  // ---------- Renderização ----------
  function buildItem(task) {
    const li = els.tpl.content.firstElementChild.cloneNode(true);
    const checkbox = li.querySelector('input[type="checkbox"]');
    const text = li.querySelector('.text');

    li.classList.toggle('done', Boolean(task.done));
    li.classList.toggle('enter', task.id === justAddedId);
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', task.done ? `Desmarcar "${task.text}"` : `Concluir "${task.text}"`);
    text.textContent = task.text;

    checkbox.addEventListener('change', () => toggleTask(task.id));
    li.querySelector('.delete').addEventListener('click', () => deleteTask(task.id));
    if (!task.done) {
      li.querySelector('.edit').addEventListener('click', () => startEdit(li, task));
      text.addEventListener('dblclick', () => startEdit(li, task));
    }
    return li;
  }

  function renderEmpty() {
    const list = tasks();
    const hasPending = list.some((t) => !t.done);
    els.pendingEmpty.hidden = hasPending;
    els.pendingEmpty.textContent = list.length
      ? 'Tudo concluído! Bom trabalho.'
      : 'Nenhuma tarefa por aqui. Toque no + para adicionar.';
  }

  function render() {
    const list = tasks();
    const pending = list.filter((t) => !t.done);
    const done = list.filter((t) => t.done).sort((a, b) => b.doneAt - a.doneAt);

    els.greeting.textContent = greeting();
    els.dateText.textContent = dateLabel(currentDate);
    els.datePicker.value = currentDate;
    els.todayBtn.hidden = currentDate === todayKey();

    // Pendentes separadas por período (tarefas antigas, sem período, ficam à parte)
    const known = (t) => PERIODS.some((p) => p.id === t.period);
    const groups = [...PERIODS, { id: null, name: 'Sem período', icon: 'clock' }]
      .map((p) => ({ p, items: pending.filter((t) => (p.id ? t.period === p.id : !known(t))) }))
      .filter((g) => g.items.length)
      .map(({ p, items }) => {
        const ul = document.createElement('ul');
        ul.className = 'list';
        ul.append(...items.map(buildItem));
        return periodSection(p, ul);
      });
    els.pendingList.replaceChildren(...groups);
    els.pendingCount.textContent = pending.length;
    renderEmpty();

    els.doneList.replaceChildren(...done.map(buildItem));
    els.doneCount.textContent = done.length;
    els.doneGroup.hidden = done.length === 0;

    renderAgenda();
  }

  // ---------- Eventos ----------
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!els.input.value.trim()) return els.input.focus();
    addTask(els.input.value);
    els.addDialog.close();
  });
  els.addCancel.addEventListener('click', () => els.addDialog.close());
  els.fab.addEventListener('click', openAddDialog);

  els.linkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let url = els.linkUrl.value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      return els.linkUrl.focus();
    }
    saveEventLink(url);
    els.linkDialog.close();
  });
  els.linkRemove.addEventListener('click', () => {
    saveEventLink(null);
    els.linkDialog.close();
  });
  els.linkCancel.addEventListener('click', () => els.linkDialog.close());

  els.syncBtn.addEventListener('click', openSyncDialog);
  els.syncClose.addEventListener('click', () => els.syncDialog.close());
  els.syncPair.addEventListener('click', showPairingQr);
  els.scanBtn.addEventListener('click', openScanner);
  els.scanDialog.addEventListener('close', stopCamera);
  els.scanEmail.addEventListener('click', () => {
    els.scanDialog.close();
    openSyncDialog();
  });
  els.syncForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.syncSubmit.disabled = true;
    try {
      await submitSync();
    } finally {
      els.syncSubmit.disabled = false;
    }
  });
  els.syncLogout.addEventListener('click', async () => {
    await TaskSync.signOut();
    els.syncDialog.close();
    showToast('Você saiu. As tarefas continuam neste aparelho.');
  });

  let syncedUserId = null;
  TaskSync.onStatus((status, user) => {
    // Acabou de entrar na conta: no site, a agenda só carrega com login
    if (user && user.id !== syncedUserId) {
      TaskCalendar.invalidate();
      syncCalendar();
    }
    // Conectou pelo link enquanto a janela esperava: fecha e avisa
    if (user && !syncedUserId && els.syncDialog.open && syncStep === 'link') {
      els.syncDialog.close();
      showToast('Sincronização ativada');
    }
    syncedUserId = user?.id ?? null;
    // Celular desconectado: a câmera aparece no lugar da nuvem
    const showScan = !user && TOUCH && !IN_WIDGET && TaskSync.status !== 'unavailable';
    els.scanBtn.hidden = !showScan;
    els.syncBtn.hidden = showScan;
    els.syncBtn.dataset.status = user ? status : 'off';
    els.syncBtn.title = user
      ? { ok: 'Sincronizado', syncing: 'Sincronizando...', error: 'Sem conexão: as mudanças serão enviadas depois' }[status] || 'Sincronização'
      : 'Sincronizar aparelhos';
    if (els.syncDialog.open) renderSyncDialog();
  });

  // Chegou algo de outro aparelho: recarrega os dados e redesenha
  TaskSync.onChange((keys) => {
    store = loadJSON(STORAGE_KEY);
    eventsDone = loadJSON(EVENTS_DONE_KEY);
    eventLinks = loadJSON(EVENT_LINKS_KEY);
    if (keys.includes('calendars')) {
      TaskCalendar.invalidate();
      syncCalendar();
    }
    if (!document.querySelector('.edit-input')) render();
  });

  // Clicar fora do card fecha as janelas
  for (const dialog of [els.addDialog, els.calDialog, els.linkDialog, els.syncDialog, els.scanDialog]) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  els.datePicker.addEventListener('click', () => {
    try { els.datePicker.showPicker(); } catch { /* navegador sem suporte: abre pelo próprio input */ }
  });
  els.datePicker.addEventListener('change', () => goTo(els.datePicker.value));
  els.todayBtn.addEventListener('click', () => goTo(todayKey()));
  els.clearDone.addEventListener('click', clearDone);

  els.agendaSettings.addEventListener('click', openCalDialog);
  els.calDialog.addEventListener('close', () => {
    if (els.calDialog.returnValue !== 'save') return;
    const urls = els.calUrls.value.split(/\s+/).filter(Boolean);
    TaskCalendar.setUrls(urls);
    TaskSync.push('taskon:calendars');
    agendaLoaded = false;
    renderAgenda();
    syncCalendar(true);
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea') || document.querySelector('dialog[open]');
    // Alt + ← / → troca de dia
    if (e.altKey && e.key === 'ArrowLeft') return goTo(shiftDay(currentDate, -1));
    if (e.altKey && e.key === 'ArrowRight') return goTo(shiftDay(currentDate, 1));
    // N abre o card de nova tarefa
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openAddDialog();
    }
  });

  // Mantém várias abas sincronizadas
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) store = loadJSON(STORAGE_KEY);
    else if (e.key === EVENTS_DONE_KEY) eventsDone = loadJSON(EVENTS_DONE_KEY);
    else if (e.key === EVENT_LINKS_KEY) eventLinks = loadJSON(EVENT_LINKS_KEY);
    else return;
    render();
  });

  // Atualiza saudação/data/agenda ao voltar para a aba (ex.: virou o dia)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!document.querySelector('.edit-input')) render();
    syncCalendar();
  });

  // A cada minuto: selo "Agora"; a agenda só é baixada de novo a cada 15 min
  setInterval(() => syncCalendar(), 60 * 1000);

  render();
  syncCalendar();
})();
