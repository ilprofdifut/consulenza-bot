const { Telegraf } = require('telegraf');

// Variabili d’ambiente (impostate su Render)
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  throw new Error('Manca BOT_TOKEN o ADMIN_CHAT_ID nelle variabili d’ambiente');
}

const bot = new Telegraf(BOT_TOKEN);
const state = new Map(); // userId -> stato
const isAdmin = (ctx) => ctx.from?.id === ADMIN_CHAT_ID;

// ===== CATCH GLOBALE: evita crash =====
bot.catch((err, ctx) => {
  console.error('Unhandled error while processing', ctx.update, '\n', err);
});

// ===== /chat [user_id] oppure reply al messaggio di registrazione =====
bot.command('chat', async (ctx) => {
  try {
    if (ctx.chat.type !== 'private') {
      return ctx.reply('Usa questo comando in privato col bot.');
    }
    if (!isAdmin(ctx)) {
      return ctx.reply('❌ Non hai i permessi per questo comando.');
    }

    const parts = ctx.message.text.split(' ').slice(1);
    let targetId = parts[0]?.trim();

    if (!targetId && ctx.message.reply_to_message) {
      const r = ctx.message.reply_to_message;
      const srcText = r.text || r.caption || '';
      const m1 = srcText.match(/(?:^|\n)\s*ID:\s*(\d{5,20})\b/i);
      if (m1) targetId = m1[1];
      else {
        const m2 = srcText.match(/ID[^\d]{0,5}(\d{5,20})/i);
        if (m2) targetId = m2[1];
      }
    }

    if (!targetId || !/^\d+$/.test(String(targetId))) {
      return ctx.reply('Uso: /chat <user_id>\nOppure: rispondi al mio messaggio di registrazione e invia /chat');
    }

    const deepLink = `tg://user?id=${encodeURIComponent(targetId)}`;

    // Prova con bottone
    try {
      const chat = await ctx.telegram.getChat(targetId).catch(() => null);
      const name = chat ? [chat.first_name, chat.last_name].filter(Boolean).join(' ') : null;
      await ctx.reply(
        `${name ? `Chat con ${name} ` : 'Link alla chat'}(ID: ${targetId})`,
        { reply_markup: { inline_keyboard: [[{ text: 'Apri su Telegram', url: deepLink }]] } }
      );
    } catch {
      // Fallback: link nel testo (niente bottone)
      const text = `Link alla chat con ID ${targetId}:\n${deepLink}`;
      await ctx.reply(text);
    }
  } catch (e) {
    console.error('Errore /chat:', e);
    await ctx.reply('❌ Errore imprevisto con /chat. Riprova tra poco.');
  }
});

// ===== /start: avvia registrazione =====
bot.start(async (ctx) => {
  state.set(ctx.from.id, 'awaiting_name');
  await ctx.reply(
    'Benvenuto👋\n' +
    'procediamo alla registrazione per la CONSULENZA DEL PROF.⚽\n' +
    'INSERISCI IL TUO NOME E COGNOME',
    {
      reply_markup: { force_reply: true, input_field_placeholder: 'Nome Cognome' }
    }
  );
});

// ===== Gestione registrazione =====
bot.on('text', async (ctx, next) => {
  const s = state.get(ctx.from.id);

  // Lascia passare i comandi (es. /chat) e tutti i messaggi se non in registrazione
  if (s !== 'awaiting_name') return next();

  const text = ctx.message.text?.trim() || '';
  if (text.startsWith('/')) return next();
  if (!text) {
    return ctx.reply('Per favore, scrivi Nome e Cognome.');
  }

  // Dati da Telegram
  const info = ctx.from;
  const userId = info.id;
  const firstName = info.first_name;
  const lastName = info.last_name || '(vuoto)';
  const username = info.username ? '@' + info.username : '(nessuno)';
  const deepLink = `tg://user?id=${encodeURIComponent(userId)}`;

  // 1) Prova invio all'admin con bottone
  const adminText =
    `Nuova registrazione:\n` +
    `Nome e Cognome (inserito): ${text}\n\n` +
    `Dati Telegram:\n` +
    `ID: ${userId}\n` +
    `Username: ${username}\n` +
    `First name: ${firstName}\n` +
    `Last name: ${lastName}`;

  const keyboard = { inline_keyboard: [[{ text: 'Apri chat', url: deepLink }]] };
  if (info.username) {
    keyboard.inline_keyboard[0].push({ text: 'Profilo t.me', url: `https://t.me/${info.username}` });
  }

  let adminNotified = false;
  try {
    await ctx.telegram.sendMessage(ADMIN_CHAT_ID, adminText, {
      reply_markup: keyboard,
      protect_content: true
    });
    adminNotified = true;
  } catch (e) {
    // Se il bottone tg:// è vietato per privacy, fallback a testo senza bottoni
    const isPrivacy =
      e?.response?.description?.includes('BUTTON_USER_PRIVACY_RESTRICTED') ||
      e?.description?.includes('BUTTON_USER_PRIVACY_RESTRICTED');

    try {
      const fallback = adminText +
        `\n\nApri chat: ${deepLink}` +
        (info.username ? `\nProfilo: https://t.me/${info.username}` : '');
      await ctx.telegram.sendMessage(ADMIN_CHAT_ID, fallback, { protect_content: true });
      adminNotified = true;
      if (!isPrivacy) console.warn('sendMessage fallback usato per errore non privacy:', e);
    } catch (e2) {
      console.error('Invio admin FALLITO (anche fallback):', e, e2);
    }
  }

  // 2) Conferma all'utente SOLO se adminNotified === true
  if (adminNotified) {
    try {
      await ctx.reply(
        '✅Registrazione completata.\n' +
        'Benvenuto!🔥\n' +
        '👉Ti ricordo che devi restare sia all\'interno della community Whatsapp, sia del gruppo Telegram.\n' +
        'Segui i consigli nei gruppi e mi raccomando: FAI TANTI MILIONI 🚀'
      );
      state.set(ctx.from.id, 'registered'); // registra solo se andato a buon fine
    } catch (e) {
      console.error('Errore nel rispondere all’utente (conferma):', e);
    }
  } else {
    // Messaggio di ERRORE personalizzato e resta in awaiting_name
    const errorMsg = `⚠️ERRORE.\n` +
      `🔴Registrazione NON completata. Tra qualche minuto riprova con la registrazione digitando nuovamente /start \n` +
      `🔴Se l'errore dovesse ripresentarsi, contatta in privato il PROF.\n` +
      `(non ignorare questo messaggio)`;
    try {
      await ctx.reply(errorMsg);
    } catch (e) {
      console.error('Errore nel rispondere all’utente (errore):', e);
    }
    state.set(ctx.from.id, 'awaiting_name'); // resta in registrazione per retry
  }

  // 3) Log utile
  console.log(`Registrazione ${userId} inviata all’admin: ${adminNotified ? 'OK' : 'NO'}`);
});

// ===== Avvio: rimuovi eventuale webhook e parti in polling =====
(async () => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch();
    console.log('Bot avviato ✅ (long polling)');
  } catch (e) {
    console.error('Errore in avvio:', e);
  }
})();

// ===== Arresto pulito (Render) =====
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

