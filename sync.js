// Sincronização do TaskON entre aparelhos (Supabase).
// Login pelo link enviado por e-mail. Cada dia de tarefas e cada configuração vira uma
// linha no banco; a alteração mais recente vence. O app continua funcionando
// offline pelo localStorage e envia o que ficou pendente quando a conexão volta.
window.TaskSync = (() => {
  const SUPABASE_URL = 'https://dabepuwjowkefhuijara.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_KwqGrFtpM8kEijl780WHhg_ksQmuZV4'; // chave pública
  const ICS_FUNCTION = `${SUPABASE_URL}/functions/v1/ics`;

  const TASKS = 'taskon:v1';
  // localStorage -> chave no banco (os dias de tarefas viram "day:AAAA-MM-DD")
  const SIMPLE = {
    'taskon:events-done': 'events-done',
    'taskon:event-links': 'event-links',
    'taskon:calendars': 'calendars',
  };
  const META_KEY = 'taskon:sync-meta'; // { chave: updated_at já conhecido }
  const DIRTY_KEY = 'taskon:sync-dirty'; // chaves esperando envio
  const OWNER_KEY = 'taskon:sync-user'; // conta com que este aparelho já sincronizou

  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  let user = null;
  let channel = null;
  let status = client ? 'off' : 'unavailable'; // off | syncing | ok | error | unavailable
  let pushTimer = null;
  const changeListeners = [];
  const statusListeners = [];

  // ---------- localStorage ----------
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sem armazenamento: só sincroniza em memória */
    }
  };

  let meta = read(META_KEY, {});
  let dirty = new Set(read(DIRTY_KEY, []));
  // Última versão conhecida de cada dia, para enviar só os dias que mudaram
  const lastDays = Object.fromEntries(Object.entries(read(TASKS, {})).map(([d, v]) => [d, JSON.stringify(v)]));

  const saveMeta = () => {
    write(META_KEY, meta);
    write(DIRTY_KEY, [...dirty]);
  };

  const localKeyOf = (key) => Object.keys(SIMPLE).find((k) => SIMPLE[k] === key);
  const emptyOf = (key) => (key === 'calendars' ? [] : {});

  function localValue(key) {
    if (key.startsWith('day:')) return read(TASKS, {})[key.slice(4)] || [];
    return read(localKeyOf(key), emptyOf(key));
  }

  function applyLocal(key, value) {
    if (key.startsWith('day:')) {
      const day = key.slice(4);
      const store = read(TASKS, {});
      if (Array.isArray(value) && value.length) store[day] = value;
      else delete store[day];
      write(TASKS, store);
      lastDays[day] = JSON.stringify(store[day] || []);
    } else if (localKeyOf(key)) {
      write(localKeyOf(key), value);
    }
  }

  function setStatus(next) {
    status = next;
    statusListeners.forEach((fn) => fn(status, user));
  }

  // ---------- Envio ----------
  function markDirty(key) {
    meta[key] = Date.now();
    dirty.add(key);
  }

  // Chamado pelo app sempre que salva algo
  function push(localKey) {
    if (localKey === TASKS) {
      const store = read(TASKS, {});
      for (const day of new Set([...Object.keys(store), ...Object.keys(lastDays)])) {
        const json = JSON.stringify(store[day] || []);
        if (json !== (lastDays[day] ?? '[]')) {
          lastDays[day] = json;
          markDirty(`day:${day}`);
        }
      }
    } else if (SIMPLE[localKey]) {
      markDirty(SIMPLE[localKey]);
    }
    saveMeta();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 500);
  }

  async function flush() {
    if (!user || !dirty.size) return;
    const keys = [...dirty];
    const rows = keys.map((key) => ({ user_id: user.id, key, value: localValue(key), updated_at: meta[key] || Date.now() }));
    setStatus('syncing');
    const { error } = await client.from('taskon_state').upsert(rows, { onConflict: 'user_id,key' });
    if (error) return setStatus('error');
    // Só limpa o que não mudou de novo enquanto enviava
    rows.forEach((row) => {
      if (meta[row.key] === row.updated_at) dirty.delete(row.key);
    });
    saveMeta();
    setStatus(dirty.size ? 'syncing' : 'ok');
    if (dirty.size) flush();
  }

  // ---------- Recebimento ----------
  function notify(keys) {
    if (keys.length) changeListeners.forEach((fn) => fn(keys));
  }

  // Junta o que já existia neste aparelho com o que está na conta (só na primeira vez)
  function merge(key, local, remote) {
    if (key.startsWith('day:')) {
      const ids = new Set(remote.map((t) => t.id));
      return [...remote, ...local.filter((t) => !ids.has(t.id))];
    }
    if (key === 'calendars') return [...new Set([...remote, ...local])];
    return { ...local, ...remote };
  }

  // Evita duas leituras ao mesmo tempo (login + reconexão do tempo real)
  let pulling = null;
  function pull() {
    if (!user) return Promise.resolve();
    pulling ??= doPull().finally(() => (pulling = null));
    return pulling;
  }

  async function doPull() {
    setStatus('syncing');
    const { data, error } = await client.from('taskon_state').select('key, value, updated_at');
    if (error) return setStatus('error');

    const firstSync = read(OWNER_KEY, null) !== user.id;
    const changed = [];
    const remoteKeys = new Set();

    for (const row of data) {
      remoteKeys.add(row.key);
      if (firstSync) {
        const local = localValue(row.key);
        const merged = merge(row.key, local, row.value);
        if (JSON.stringify(merged) !== JSON.stringify(row.value)) {
          applyLocal(row.key, merged);
          markDirty(row.key);
        } else {
          applyLocal(row.key, row.value);
          meta[row.key] = row.updated_at;
        }
        changed.push(row.key);
      } else if (dirty.has(row.key) && meta[row.key] >= row.updated_at) {
        // A versão deste aparelho é mais nova: vai ser enviada
      } else if (!meta[row.key] || row.updated_at > meta[row.key]) {
        applyLocal(row.key, row.value);
        meta[row.key] = row.updated_at;
        dirty.delete(row.key);
        changed.push(row.key);
      }
    }

    // Primeira vez: o que só existe neste aparelho também sobe para a conta
    if (firstSync) {
      const localKeys = [
        ...Object.keys(read(TASKS, {})).map((d) => `day:${d}`),
        ...Object.entries(SIMPLE).filter(([k]) => localStorage.getItem(k)).map(([, v]) => v),
      ];
      localKeys.filter((k) => !remoteKeys.has(k)).forEach(markDirty);
      write(OWNER_KEY, user.id);
    }

    saveMeta();
    notify(changed);
    if (dirty.size) await flush();
    else setStatus('ok');
  }

  function onRemoteRow(row) {
    if (!row?.key || (meta[row.key] && row.updated_at <= meta[row.key])) return; // eco do próprio envio
    if (dirty.has(row.key) && meta[row.key] >= row.updated_at) return;
    applyLocal(row.key, row.value);
    meta[row.key] = row.updated_at;
    dirty.delete(row.key);
    saveMeta();
    notify([row.key]);
  }

  // ---------- Conta ----------
  async function start(nextUser) {
    if (user?.id === nextUser.id) return;
    user = nextUser;
    channel?.unsubscribe();
    channel = client
      .channel(`taskon-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taskon_state', filter: `user_id=eq.${user.id}` },
        (payload) => onRemoteRow(payload.new))
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') pull(); // pega o que mudou enquanto estava desconectado
      });
    await pull();
  }

  function stop() {
    user = null;
    channel?.unsubscribe();
    channel = null;
    setStatus('off');
  }

  if (client) {
    client.auth.onAuthStateChange((_event, session) => {
      // Fora do callback, para não travar o cliente de autenticação
      setTimeout(() => (session?.user ? start(session.user) : stop()), 0);
    });
    window.addEventListener('online', () => pull());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pull();
    });
  }

  return {
    get status() { return status; },
    get user() { return user; },
    push,
    onChange: (fn) => changeListeners.push(fn),
    onStatus: (fn) => {
      statusListeners.push(fn);
      fn(status, user);
    },
    // O e-mail leva ao site (Site URL do Supabase) ou, no widget, de volta ao próprio widget
    sendCode: (email, redirectTo) =>
      client.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo } }),
    // Sessão entregue pelo widget (link do e-mail aberto no navegador do PC)
    setSession: (tokens) => client.auth.setSession(tokens),
    // Link colado: valida o token dele sem abrir o navegador
    verifyLink: (tokenHash, type) => client.auth.verifyOtp({ token_hash: tokenHash, type }),
    signOut: () => client.auth.signOut({ scope: 'local' }),
    icsEndpoint: ICS_FUNCTION,
    // Link de acesso de uso único para conectar outro aparelho sem e-mail (vira QR code)
    async deviceLink() {
      const token = (await client.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/device-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.link) throw new Error(data.error || 'Não foi possível gerar o código');
      return data.link;
    },
    async accessToken() {
      return client ? (await client.auth.getSession()).data.session?.access_token : null;
    },
  };
})();
