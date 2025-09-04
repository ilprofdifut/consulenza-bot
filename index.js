const { Telegraf } = require('telegraf');

// Variabili d’ambiente (impostate su Render)
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  throw new Error('Manca BOT_TOKEN o ADMIN_CHAT_ID nelle variabili d’ambiente');
}

const bot = new Telegraf(BOT_TOKEN);
const state = new Map(); // userId -> stato

bot.start(async (ctx) => {
  state.set(ctx.from.id, 'awaiting_name');
  await ctx.reply(
    'Benvenuto👋,\n' +
    'procediamo alla registrazione per CONSULENZA DEL PROF.⚽\n' +
    'INSERISCI IL TUO NOME E COGNOME',
    {
      reply_markup: { force_reply: true, input_field_placeholder: 'Nome Cognome' }
    }
  );
});

bot.on('text', async (ctx) => {
  const s = state.get(ctx.from.id);
  if (s !== 'awaiting_name') return;

  const fullName = ctx.message.text?.trim();
  if (!fullName || fullName.startsWith('/')) {
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
    `Nome e Cognome (inserito): ${fullName}\n\n` +
    `Dati Telegram:\n` +
    `ID: ${userId}\n` +
    `Username: ${username}\n` +
    `First name: ${firstName}\n` +
    `Last name: ${lastName}`
  );

  // Conferma all’utente (nuovo testo)
  await ctx.reply(
    '✅Registrazione completata.\n' +
    'Benvenuto!🔥\n' +
    '👉Ti ricordo che devi restare sia all\'interno della community Whatsapp, sia del gruppo Telegram.\n' +
    'Segui i consigli nei gruppi e mi raccomando: FAI TANTI MILIONI 🚀'
  );

  state.set(ctx.from.id, 'registered');
});

bot.launch();
