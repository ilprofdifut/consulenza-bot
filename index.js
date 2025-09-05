const { Telegraf } = require('telegraf');

// Variabili d’ambiente (impostate su Render)
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  throw new Error('Manca BOT_TOKEN o ADMIN_CHAT_ID nelle variabili d’ambiente');
}

const bot = new Telegraf(BOT_TOKEN);
const state = new Map(); // userId -> stato

// Helper admin
const isAdmin = (ctx) => ctx.from?.id === ADMIN_CHAT_ID;

// /chat [user_id]
// - Se passi l'ID: usa quello
// - Se rispondi al messaggio del bot con dentro "ID: <numero>": lo estrae dal testo
bot.command('chat', async (ctx) => {
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

    // Cerca "ID: <numero>" nel testo del messaggio a cui stai rispondendo
    const m1 = srcText.match(/(?:^|\n)\s*ID:\s*(\d{5,20})\b/i);
    if (m1) targetId = m1[1];
    else {
      // fallback molto stretto: "ID" vicino a numeri
      const m2 = srcText.match(/ID[^\d]{0,5}(\d{5,20})/i);
      if (m2) targetId = m2[1];
    }
  }

  if (!targetId || !/^\d+$/.test(String(targetId))) {
    return ctx.reply('Uso: /chat <user_id>\nOppure: rispondi al mio messaggio di registrazione e invia /chat');
  }

  const deepLink = `tg://user?id=${encodeURIComponent(targetId)}`;

  try {
    // Se il bot ha già “visto” quell’utente, mostra anche nome/cognome
    const chat = await ctx.telegram.getChat(targetId);
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'utente';
    await ctx.reply(`Chat con ${name} (ID: ${targetId})`, {
      reply_markup: { inline_keyboard: [[{ text: 'Apri su Telegram', url: deepLink }]] }
    });
  } catch {
    // Altrimenti mostra solo il deep link
    await ctx.reply(`Link alla chat con ID ${targetId}:`, {
      reply_markup: { inline_keyboard: [[{ text: 'Apri su Telegram', url: deepLink }]] }
    });
  }
});

// /start: avvia registrazione
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

// Registrazione: gestisci solo quando stai aspettando "Nome Cognome"
// e lascia passare i COMANDI agli altri handler (next())
bot.on('text', async (ctx, next) => {
  const s = state.get(ctx.from.id);

  // Se non stiamo aspettando il nome, passa oltre (permette a /chat & co. di funzionare)
  if (s !== 'awaiting_name') return next();

  const text = ctx.message.text?.trim() || '';

  // Se è un comando (es. /chat, /start), lascialo gestire agli altri handler
  if (text.startsWith('/')) return next();

  if (!text) {
    return ctx.reply('Per favore, scrivi Nome e Cognome.');
  }

  // Dati da Telegram
  const info = ctx.from;
  const userId = info.id;
  const firstName = info.first_name;
  const lastName = info.last_name || "(vuoto)";
  const username = info.username ? '@' + info.username : "(nessuno)";

  const deepLink = `tg://user?id=${encodeURIComponent(userId)}`;

  // Messaggio all’admin con TUTTO + bottone "Apri chat"
  const adminText =
    `Nuova registrazione:\n` +
    `Nome e Cognome (inserito): ${text}\n\n` +
    `Dati Telegram:\n` +
    `ID: ${userId}\n` +
    `Username: ${username}\n` +
    `First name: ${firstName}\n` +
    `Last name: ${lastName}`;

  const buttons = [[{ text: 'Apri chat', url: deepLink }]];
  // Se c'è username, aggiungi anche link t.me
  if (info.username) {
    buttons[0].push({ text: 'Profilo t.me', url: `https://t.me/${info.username}` });
  }

  await ctx.telegram.sendMessage(ADMIN_CHAT_ID, adminText, {
    reply_markup: { inline_keyboard: buttons }
  });

  // Conferma all’utente
  await ctx.reply(
    '✅Registrazione completata.\n' +
    'Benvenuto!🔥\n' +
    '👉Ti ricordo che devi restare sia all\'interno della community Whatsapp, sia del gruppo Telegram.\n' +
    'Segui i consigli nei gruppi e mi raccomando: FAI TANTI MILIONI 🚀'
  );

  state.set(ctx.from.id, 'registered');
});

// Avvio: rimuovi eventuale webhook e parti in polling
(async () => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch();
    console.log('Bot avviato ✅ (long polling)');
  } catch (e) {
    console.error('Errore in avvio:', e);
  }
})();

// Arresto pulito (utile su Render)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
