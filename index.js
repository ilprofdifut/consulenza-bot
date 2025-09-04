const { Telegraf } = require('telegraf');

// Variabili d’ambiente (impostate su Render)
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  throw new Error('Manca BOT_TOKEN o ADMIN_CHAT_ID nelle variabili d’ambiente');
}

const bot = new Telegraf(BOT_TOKEN);
const state = new Map(); // userId -> stato

// /chat <user_id>: genera deep link alla chat con quell'utente (anche senza username)
bot.command('chat', async (ctx) => {
  // Consenti solo in chat privata e solo all'admin
  if (ctx.chat.type !== 'private') {
    return ctx.reply('Usa questo comando in privato col bot.');
  }
  if (ctx.from.id !== ADMIN_CHAT_ID) {
    return ctx.reply('❌ Non hai i permessi per questo comando.');
  }

  const args = ctx.message.text.split(' ').slice(1);
  if (!args.length) {
    return ctx.reply('Uso: /chat <user_id>');
  }

  const targetUserId = args[0].trim();
  const deepLink = `tg://user?id=${encodeURIComponent(targetUserId)}`;

  try {
    // Funziona solo se il bot ha già “visto” quell’utente
    const chat = await ctx.telegram.getChat(targetUserId);
    const full = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'utente';
    await ctx.reply(`Chat con ${full} (ID: ${targetUserId})`, {
      reply_markup: { inline_keyboard: [[{ text: 'Apri su Telegram', url: deepLink }]] }
    });
  } catch {
    // Mostra comunque il deep link
    await ctx.reply(`Link alla chat con ID ${targetUserId}:`, {
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

  // Se non stiamo aspettando il nome, passa al prossimo middleware (comandi ecc.)
  if (s !== 'awaiting_name') return next();

  const text = ctx.message.text?.trim() || '';

  // Se l'utente invia un comando (es. /chat, /start), lascia che lo gestiscano gli handler dei comandi
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

  // Messaggio all’admin con TUTTO
  await ctx.telegram.sendMessage(
    ADMIN_CHAT_ID,
    `Nuova registrazione:\n` +
    `Nome e Cognome (inserito): ${text}\n\n` +
    `Dati Telegram:\n` +
    `ID: ${userId}\n` +
    `Username: ${username}\n` +
    `First name: ${firstName}\n` +
    `Last name: ${lastName}`
  );

  // Conferma all’utente
  await ctx.reply(
    '✅Registrazione completata.\n' +
    'Benvenuto!🔥\n' +
    '👉Ti ricordo che devi restare sia all\'interno della community Whatsapp, sia del gruppo Telegram.\n' +
    'Segui i consigli nei gruppi e mi raccomando: FAI TANTI MILIONI 🚀'
  );

  state.set(ctx.from.id, 'registered');
});

// Avvio: (opzionale) rimuovi eventuale webhook e parti in polling
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
