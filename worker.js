const ADMIN_ID = "7179564769";
const BKASH_NUMBER = "01701656518";
const CHANNEL_LINK = "https://t.me/SB_Technology_7";

const PACKAGES = {
  "1 Day": 10,
  "3 Days": 20,
  "7 Days": 50,
  "30 Days": 150,
  "3 Month": 450,
  "6 Month": 900
};

export default {
  async fetch(request, env) {
    try {
      await initDB(env.DB);

      if (request.method === "GET") {
        return new Response("Vip Wifi Voucher Bot is running ✅");
      }

      if (request.method === "POST") {
        const update = await request.json();
        await handleUpdate(update, env);
        return new Response("OK");
      }

      return new Response("Method Not Allowed", { status: 405 });
    } catch (error) {
      console.error(error);
      return new Response("OK");
    }
  }
};


// ======================================================
// DATABASE
// ======================================================

async function initDB(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE NOT NULL,
        username TEXT,
        balance INTEGER NOT NULL DEFAULT 0,
        language TEXT NOT NULL DEFAULT 'bn',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        sold_to TEXT,
        sold_at TEXT
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT NOT NULL,
        package TEXT NOT NULL,
        voucher_code TEXT NOT NULL,
        price INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS balance_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        txid TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        telegram_id TEXT PRIMARY KEY,
        state TEXT,
        data TEXT
      )
    `)
  ]);
}


// ======================================================
// TELEGRAM API
// ======================================================

async function tg(env, method, data = {}) {
  const url =
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  return await response.json();
}

async function sendMessage(env, chatId, text, keyboard = null) {
  const data = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };

  if (keyboard) {
    data.reply_markup = keyboard;
  }

  return tg(env, "sendMessage", data);
}

async function answerCallback(env, id, text = "") {
  return tg(env, "answerCallbackQuery", {
    callback_query_id: id,
    text
  });
}


// ======================================================
// UPDATE HANDLER
// ======================================================

async function handleUpdate(update, env) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  if (!update.message) return;

  const message = update.message;
  const chatId = String(message.chat.id);
  const text = message.text || "";

  await ensureUser(env.DB, message.from);

  if (text.startsWith("/start")) {
    await startCommand(chatId, env);
    return;
  }

  if (text === "/buy") {
    await buyMenu(chatId, env);
    return;
  }

  if (text === "/balance") {
    await balanceMenu(chatId, env);
    return;
  }

  if (text === "/orders") {
    await ordersMenu(chatId, env);
    return;
  }

  if (text === "/support") {
    await supportMenu(chatId, env);
    return;
  }

  if (text === "/language") {
    await languageMenu(chatId, env);
    return;
  }

  if (text === "/back") {
    await mainMenu(chatId, env);
    return;
  }

  if (chatId === ADMIN_ID) {
    if (await handleAdminText(chatId, text, env)) {
      return;
    }
  }

  const session = await getSession(env.DB, chatId);

  if (session) {
    await handleSession(chatId, text, session, env);
    return;
  }

  if (text === "🛒 Buy Card") {
    await buyMenu(chatId, env);
  } else if (text === "💰 My Balance") {
    await balanceMenu(chatId, env);
  } else if (text === "📦 My Orders") {
    await ordersMenu(chatId, env);
  } else if (text === "👤 Support Admin") {
    await supportMenu(chatId, env);
  } else if (text === "🌐 Language") {
    await languageMenu(chatId, env);
  } else if (text === "👑 Admin Panel" && chatId === ADMIN_ID) {
    await adminPanel(chatId, env);
  } else if (text === "➕ Add Balance") {
    await addBalanceStart(chatId, env);
  } else if (text === "↩️ Back") {
    await mainMenu(chatId, env);
  }
}


// ======================================================
// USER
// ======================================================

async function ensureUser(db, from) {
  await db.prepare(`
    INSERT INTO users (telegram_id, username)
    VALUES (?, ?)
    ON CONFLICT(telegram_id)
    DO UPDATE SET username = excluded.username
  `).bind(
    String(from.id),
    from.username || ""
  ).run();
}


// ======================================================
// MAIN MENU
// ======================================================

async function startCommand(chatId, env) {
  await sendMessage(
    env,
    chatId,
    `🌟 <b>Welcome to Vip Wifi Voucher!</b>

💰 ফ্রি ইনকাম ও অনলাইন আয়ের টিপস
📶 ইন্টারনেট অফার ও নতুন আপডেট
🎁 বিভিন্ন ফ্রি সুবিধার খবর

📢 আমাদের চ্যানেল:
👉 ${CHANNEL_LINK}

❤️ সাথে থাকুন, নতুন আপডেট পেতে!`
  );

  await mainMenu(chatId, env);
}

async function mainMenu(chatId, env) {
  const buttons = [
    [
      { text: "🛒 Buy Card" },
      { text: "💰 My Balance" }
   
