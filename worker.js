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

const PACKAGE_DAYS = {
  "1 Day": "1 Day",
  "3 Days": "3 Days",
  "7 Days": "7 Days",
  "30 Days": "30 Days",
  "3 Month": "3 Month",
  "6 Month": "6 Month"
};

export default {
  async fetch(request, env) {
    try {
      await initDB(env);

      if (request.method !== "POST") {
        return new Response("Vip Wifi Voucher Bot is running.", {
          status: 200
        });
      }

      const update = await request.json();

      if (update.callback_query) {
        await handleCallback(update.callback_query, env);
      } else if (update.message) {
        await handleMessage(update.message, env);
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error(error);
      return new Response("OK", { status: 200 });
    }
  }
};


// ============================================================
// DATABASE
// ============================================================

async function initDB(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      balance INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'bn',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      sold_to TEXT,
      sold_at TEXT
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      package TEXT NOT NULL,
      voucher_code TEXT NOT NULL,
      price INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS balance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      txid TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      telegram_id TEXT PRIMARY KEY,
      state TEXT,
      data TEXT
    )
  `).run();
}


// ============================================================
// TELEGRAM API
// ============================================================

async function telegram(method, body, env) {
  const token = env.BOT_TOKEN;

  if (!token) {
    throw new Error("BOT_TOKEN secret is missing");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  return await response.json();
}

async function sendMessage(env, chatId, text, keyboard = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };

  if (keyboard) {
    body.reply_markup = {
      inline_keyboard: keyboard
    };
  }

  return telegram("sendMessage", body, env);
}

async function answerCallback(env, callbackId) {
  return telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callbackId
    },
    env
  );
}


// ============================================================
// USER
// ============================================================

async function ensureUser(message, env) {
  const user = message.from;

  await env.DB.prepare(`
    INSERT INTO users (telegram_id, username)
    VALUES (?, ?)
    ON CONFLICT(telegram_id)
    DO UPDATE SET username = excluded.username
  `)
    .bind(
      String(user.id),
      user.username || ""
    )
    .run();
}


// ============================================================
// SESSION
// ============================================================

async function setSession(env, telegramId, state, data = {}) {
  await env.DB.prepare(`
    INSERT INTO user_sessions (telegram_id, state, data)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id)
    DO UPDATE SET state = excluded.state, data = excluded.data
  `)
    .bind(
      String(telegramId),
      state,
      JSON.stringify(data)
    )
    .run();
}

async function getSession(env, telegramId) {
  const result = await env.DB.prepare(`
    SELECT state, data
    FROM user_sessions
    WHERE telegram_id = ?
  `)
    .bind(String(telegramId))
    .first();

  if (!result) {
    return null;
  }

  let data = {};

  try {
    data = JSON.parse(result.data || "{}");
  } catch (_) {
    data = {};
  }

  return {
    state: result.state,
    data
  };
}

async function clearSession(env, telegramId) {
  await env.DB.prepare(`
    DELETE FROM user_sessions
    WHERE telegram_id = ?
  `)
    .bind(String(telegramId))
    .run();
}


// ============================================================
// MAIN MESSAGE HANDLER
// ============================================================

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const telegramId = String(message.from.id);
  const text = (message.text || "").trim();

  await ensureUser(message, env);

  if (text === "/start") {
    await clearSession(env, telegramId);
    await startCommand(chatId, env);
    return;
  }

  if (text === "/buy") {
    await clearSession(env, telegramId);
    await showPackages(chatId, env);
    return;
  }

  if (text === "/balance") {
    await clearSession(env, telegramId);
    await showBalance(chatId, env);
    return;
  }

  if (text === "/orders") {
    await clearSession(env, telegramId);
    await showOrders(chatId, telegramId, env);
    return;
  }

  if (text === "/support") {
    await clearSession(env, telegramId);
    await showSupport(chatId, env);
    return;
  }

  if (text === "/language") {
    await clearSession(env, telegramId);
    await showLanguage(chatId, env);
    return;
  }

  if (text === "/back") {
    await clearSession(env, telegramId);
    await mainMenu(chatId, env);
    return;
  }

  const session = await getSession(env, telegramId);

  if (session) {
    await handleSession(message, session, env);
    return;
  }

  await mainMenu(chatId, env);
}


// ============================================================
// START
// ============================================================

async function startCommand(chatId, env) {
  const text =
`🌟 <b>Welcome to Vip Wifi Voucher!</b>

💰 ফ্রি ইনকাম ও অনলাইন আয়ের টিপস
📶 ইন্টারনেট অফার ও নতুন আপডেট
🎁 বিভিন্ন ফ্রি সুবিধার খবর

📢 <b>আমাদের চ্যানেল:</b>
👉 ${CHANNEL_LINK}

❤️ সাথে থাকুন, নতুন আপডেট পেতে!`;

  const keyboard = [
    [
      {
        text: "📢 Channel",
        url: CHANNEL_LINK
      }
    ],
    [
      {
        text: "🛒 Buy Card",
        callback_data: "buy"
      },
      {
        text: "💰 My Balance",
        callback_data: "balance"
      }
    ],
    [
      {
        text: "📦 My Orders",
        callback_data: "orders"
      },
      {
        text: "👤 Support",
        callback_data: "support"
      }
    ],
    [
      {
        text: "🌐 Language",
        callback_data: "language"
      }
    ]
  ];

  await sendMessage(env, chatId, text, keyboard);
  await mainMenu(chatId, env);
}


// ============================================================
// MAIN MENU
// ============================================================

async function mainMenu(chatId, env) {
  const buttons = [
    [
      {
        text: "🛒 Buy Card",
        callback_data: "buy"
      },
      {
        text: "💰 My Balance",
        callback_data: "balance"
      }
    ],
    [
      {
        text: "📦 My Orders",
        callback_data: "orders"
      },
      {
        text: "👤 Support Admin",
        callback_data: "support"
      }
    ],
    [
      {
        text: "🌐 Language",
        callback_data: "language"
      }
    ]
  ];

  if (String(chatId) === ADMIN_ID) {
    buttons.push([
      {
        text: "👑 Admin Panel",
        callback_data: "admin"
      }
    ]);
  }

  await sendMessage(
    env,
    chatId,
    "🏠 <b>Main Menu</b>\n\nএকটি অপশন নির্বাচন করুন:",
    buttons
  );
}


// ============================================================
// BUY
// ============================================================

async function showPackages(chatId, env) {
  const buttons = [];

  for (const [pkg, price] of Object.entries(PACKAGES)) {
    buttons.push([
      {
        text: `${pkg} — ৳${price}`,
        callback_data: `buy:${pkg}`
      }
    ]);
  }

  buttons.push([
    {
      text: "↩️ Back",
      callback_data: "back"
    }
  ]);

  await sendMessage(
    env,
    chatId,
    "🛒 <b>Buy Card</b>\n\nআপনার পছন্দের প্যাকেজ নির্বাচন করুন:",
    buttons
  );
}

async function buyPackage(chatId, telegramId, pkg, env) {
  const price = PACKAGES[pkg];

  if (!price) {
    return;
  }

  const user = await env.DB.prepare(`
    SELECT balance
    FROM users
    WHERE telegram_id = ?
  `)
    .bind(String(telegramId))
    .first();

  if (!user) {
    return;
  }

  if (Number(user.balance) < price) {
    await sendMessage(
      env,
      chatId,
      `❌ <b>Insufficient Balance</b>

💰 আপনার ব্যালেন্স: ৳${user.balance}
💳 প্রয়োজন: ৳${price}

আগে আপনার Balance Add করুন।`,
      [
        [
          {
            text: "➕ Add Balance",
            callback_data: "addbalance"
          }
        ],
        [
          {
            text: "↩️ Back",
            callback_data: "back"
          }
        ]
      ]
    );
    return;
  }

  const voucher = await env.DB.prepare(`
    SELECT id, code
    FROM vouchers
    WHERE package = ?
      AND status = 'available'
    ORDER BY id ASC
    LIMIT 1
  `)
    .bind(pkg)
    .first();

  if (!voucher) {
    await sendMessage(
      env,
      chatId,
      "❌ <b>No card available</b>\n\nএই প্যাকেজের কার্ড বর্তমানে শেষ।",
      [
        [
          {
            text: "↩️ Back",
            callback_data: "buy"
          }
        ]
      ]
    );
    return;
  }

  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE vouchers
    SET status = 'sold',
        sold_to = ?,
        sold_at = ?
    WHERE id = ?
      AND status = 'available'
  `)
    .bind(
      String(telegramId),
      now,
      voucher.id
    )
    .run();

  await env.DB.prepare(`
    UPDATE users
    SET balance = balance - ?
    WHERE telegram_id = ?
      AND balance >= ?
  `)
    .bind(
      price,
      String(telegramId),
      price
    )
    .run();

  await env.DB.prepare(`
    INSERT INTO orders
    (telegram_id, package, voucher_code, price)
    VALUES (?, ?, ?, ?)
  `)
    .bind(
      String(telegramId),
      pkg,
      voucher.code,
      price
    )
    .run();

  await sendMessage(
    env,
    chatId,
    `✅ <b>Purchase Successful!</b>

📦 Package: <b>${pkg}</b>
💰 Price: <b>৳${price}</b>

🎫 <b>Your Voucher Code:</b>

<code>${voucher.code}</code>

💡 উপরের কোডটি সংরক্ষণ করে রাখুন।

ধন্যবাদ ❤️`,
    [
      [
        {
          text: "🛒 Buy Another",
          callback_data: "buy"
        }
      ],
      [
        {
          text: "📦 My Orders",
          callback_data: "orders"
        }
      ]
    ]
  );
}


// ============================================================
// BALANCE
// ============================================================

async function showBalance(chatId, env) {
  const user = await env.DB.prepare(`
    SELECT balance
    FROM users
    WHERE telegram_id = ?
  `)
    .bind(String(chatId))
    .first();

  const balance = user ? Number(user.balance) : 0;

  await sendMessage(
    env,
    chatId,
    `💰 <b>My Balance</b>

💵 Current Balance: <b>৳${balance}</b>

আপনার ব্যালেন্স দিয়ে Voucher Card কিনতে পারবেন।`,
    [
      [
        {
          text: "➕ Add Balance",
          callback_data: "addbalance"
        }
      ],
      [
        {
          text: "📜 Balance History",
          callback_data: "balancehistory"
        }
      ],
      [
        {
          text: "↩️ Back",
          callback_data: "back"
        }
      ]
    ]
  );
}


// ============================================================
// ADD BALANCE
// ============================================================

async function addBalanceStart(chatId, telegramId, env) {
  await setSession(env, telegramId, "balance_amount");

  await sendMessage(
    env,
    chatId,
    `➕ <b>Add Balance</b>

💳 Payment Method: <b>bKash Send Money</b>
📱 bKash Number: <code>${BKASH_NUMBER}</code>

💰 Minimum Amount: <b>৳50</b>

আপনি কত টাকা Add করতে চান?
\nশুধু টাকার পরিমাণ লিখুন।`,
    [
      [
        {
          text: "↩️ Back",
          callback_data: "balance"
        }
      ]
    ]
  );
}

async function askTransactionId(chatId, telegramId, amount, env) {
  await setSession(
    env,
    telegramId,
    "balance_txid",
    {
      amount
    }
  );

  await sendMessage(
    env,
    chatId,
    `💳 <b>bKash Payment</b>

📱 Send Money করুন:
<code>${BKASH_NUMBER}</code>

💰 Amount: <b>৳${amount}</b>

Payment করার পর আপনার <b>Transaction ID (TxID)</b> লিখুন।`,
    [
      [
        {
          text: "↩️ Back",
          callback_data: "balance"
        }
      ]
    ]
  );
}

async function submitBalanceRequest(
  chatId,
  telegramId,
  amount,
  txid,
  env
) {
  const existing = await env.DB.prepare(`
    SELECT id
    FROM balance_requests
    WHERE txid = ?
    LIMIT 1
  `)
    .bind(txid)
    .first();

  if (existing) {
    await clearSession(env, telegramId);

    await sendMessage(
      env,
      chatId,
      "❌ এই Transaction ID আগে জমা দেওয়া হয়েছে।"
    );

    return;
  }

  const result = await env.DB.prepare(`
    INSERT INTO balance_requests
    (telegram_id, amount, txid, status)
    VALUES (?, ?, ?, 'pending')
  `)
    .bind(
      String(telegramId),
      amount,
      txid
    )
    .run();

  const requestId = result.meta.last_row_id;

  await clearSession(env, telegramId);

  await sendMessage(
    env,
    chatId,
    `✅ <b>Balance Request Submitted</b>

💰 Amount: <b>৳${amount}</b>
🧾 TxID: <code>${txid}</code>

⏳ Admin payment যাচাই করে Balance যোগ করবেন।`
  );

  await sendMessage(
    env,
    ADMIN_ID,
    `💰 <b>New Balance Request</b>

🆔 Request: #${requestId}
👤 User ID: <code>${telegramId}</code>
💵 Amount: <b>৳${amount}</b>
🧾 TxID: <code>${txid}</code>`,
    [
      [
        {
          text: "✅ Approve",
          callback_data: `approve_balance:${requestId}`
        },
        {
          text: "❌ Reject",
          callback_data: `reject_balance:${requestId}`
        }
      ]
    ]
  );
}


// ============================================================
// BALANCE HISTORY
// ============================================================

async function balanceHistory(chatId, telegramId, env) {
  const rows = await env.DB.prepare(`
    SELECT amount, txid, status, created_at
    FROM balance_requests
    WHERE telegram_id = ?
    ORDER BY id DESC
    LIMIT 10
  `)
    .bind(String(telegramId))
    .all();

  if (!rows.results.length) {
    await sendMessage(
      env,
      chatId,
      "📜 <b>Balance History</b>\n\nকোনো Balance Request নেই।",
      [
        [
          {
            text: "↩️ Back",
            callback_data: "balance"
          }
        ]
      ]
    );
    return;
  }

  let text = "📜 <b>Balance History</b>\n\n";

  for (const row of rows.results) {
    let status = "⏳ Pending";

    if (row.status === "approved") {
      status = "✅ Approved";
    }

    if (row.status === "rejected") {
      status = "❌ Rejected";
    }

    text +=
      `💰 ৳${row.amount}\n` +
      `🧾 ${row.txid}\n` +
      `${status}\n` +
      `📅 ${row.created_at}\n\n`;
  }

  await sendMessage(
    env,
    chatId,
    text,
    [
      [
        {
          text: "↩️ Back",
          callback_data: "balance"
        }
      ]
    ]
  );
}


// ============================================================
// ORDERS
// ============================================================

async function showOrders(chatId, telegramId, env) {
  const rows = await env.DB.prepare(`
    SELECT package, voucher_code, price, created_at
    FROM orders
    WHERE telegram_id = ?
    ORDER BY id DESC
    LIMIT 20
  `)
    .bind(String(telegramId))
    .all();

  if (!rows.results.length) {
    await sendMessage(
      env,
      chatId,
      "📦 <b>My Orders</b>\n\nআপনার কোনো Order নেই।",
      [
        [
          {
            text: "🛒 Buy Card",
            callback_data: "buy"
          }
        ],
        [
          {
            text: "↩️ Back",
            callback_data: "back"
          }
        ]
      ]
    );
    return;
  }

  let text = "📦 <b>My Orders</b>\n\n";

  for (const row of rows.results) {
    text +=
      `📦 Package: <b>${row.package}</b>\n` +
      `💰 Price: ৳${row.price}\n` +
      `🎫 Code: <code>${row.voucher_code}</code>\n` +
      `📅 ${row.created_at}\n\n`;
  }

  await sendMessage(
    env,
    chatId,
    text,
    [
      [
        {
          text: "↩️ Back",
          callback_data: "back"
        }
      ]
    ]
  );
}


// ============================================================
// SUPPORT
// ============================================================

async function showSupport(chatId, env) {
  await sendMessage(
    env,
    chatId,
    `👤 <b>Support Admin</b>

কোনো সমস্যা হলে Admin-এর সাথে যোগাযোগ করুন।

📱 Admin ID:
<code>${ADMIN_ID}</code>`,
    [
      [
        {
          text: "💬 Contact Admin",
          url: `tg://user?id=${ADMIN_ID}`
        }
      ],
      [
        {
          text: "↩️ Back",
          callback_data: "back"
        }
      ]
    ]
  );
}


// ============================================================
// LANGUAGE
// ============================================================

async function showLanguage(chatId, env) {
  await sendMessage(
    env,
    chatId,
    "🌐 <b>Language</b>\n\nভাষা নির্বাচন করুন:",
    [
      [
        {
          text: "🇧🇩 বাংলা",
          callback_data: "lang:bn"
        },
        {
          text: "🇬🇧 English",
          callback_data: "lang:en"
        }
      ],
      [
        {
          text: "↩️ Back",
          callback_data: "back"
        }
      ]
    ]
  );
}


// ============================================================
// ADMIN PANEL
// ============================================================

async function adminPanel(chatId, env) {
  if (String(chatId) !== ADMIN_ID) {
    return;
  }

  await sendMessage(
    env,
    chatId,
    "👑 <b>Admin Panel</b>\n\nপ্রয়োজনীয় অপশন নির্বাচন করুন:",
    [
      [
        {
          text: "➕ Voucher Add",
          callback_data: "voucher_add"
        }
      ],
      [
        {
          text: "📦 Stock",
          callback_data: "stock"
        },
        {
          text: "📋 Pending",
          callback_data: "pending"
        }
      ],
      [
        {
          text: "💰 Sales",
          callback_data: "sales"
        }
      ],
      [
        {
          text: "↩️ Back",
          callback_data: "back"
        }
      ]
    ]
  );
}


// ============================================================
// VOUCHER ADD
// ============================================================
async function startVoucherAdd(chatId, telegramId, pkg, env) {
  await setSession(env, telegramId, "voucher_add", {
    package: pkg
  });

  await sendMessage(
    env,
    chatId,
    `➕ <b>Voucher Add</b>

📦 Package: <b>${pkg}</b>

প্রতিটি Voucher Code আলাদা লাইনে পাঠান।

উদাহরণ:
ABC123
XYZ456
HELLO789

সব Code শেষ হলে /done লিখুন।`,
    [
      [
        {
          text: "❌ Cancel",
          callback_data: "admin"
        }
      ]
    ]
  );
}

async function addVoucherCodes(
  chatId,
  telegramId,
  packageName,
  text,
  env
) {
  const codes = text
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  if (!codes.length) {
    await sendMessage(env, chatId, "❌ কোনো Voucher Code পাওয়া যায়নি।");
    return;
  }

  let added = 0;
  let duplicate = 0;

  for (const code of codes) {
    try {
      await env.DB.prepare(`
        INSERT INTO vouchers (package, code, status)
        VALUES (?, ?, 'available')
      `)
        .bind(packageName, code)
        .run();

      added++;
    } catch (_) {
      duplicate++;
    }
  }

  await sendMessage(
    env,
    chatId,
    `✅ <b>Voucher Add Complete</b>

📦 Package: ${packageName}
➕ Added: <b>${added}</b>
⚠️ Duplicate/Skipped: <b>${duplicate}</b>`
  );
}async function showStock(chatId, env) {
  if (String(chatId) !== ADMIN_ID) return;

  let text = "📦 <b>Voucher Stock</b>\n\n";

  for (const pkg of Object.keys(PACKAGES)) {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM vouchers
      WHERE package = ?
      AND status = 'available'
    `)
      .bind(pkg)
      .first();

    text += `📦 ${pkg}: <b>${result.total}</b>\n`;
  }

  await sendMessage(
    env,
    chatId,
    text,
    [
      [
        {
          text: "↩️ Back",
          callback_data: "admin"
        }
      ]
    ]
  );
}

async function showPending(chatId, env) {
  if (String(chatId) !== ADMIN_ID) return;

  const rows = await env.DB.prepare(`
    SELECT id, telegram_id, amount, txid, created_at
    FROM balance_requests
    WHERE status = 'pending'
    ORDER BY id ASC
    LIMIT 20
  `).all();

  if (!rows.results.length) {
    await sendMessage(
      env,
      chatId,
      "📋 <b>Pending Requests</b>\n\nকোনো Pending Request নেই।"
    );
    return;
  }

  for (const row of rows.results) {
    await sendMessage(
      env,
      chatId,
      `📋 <b>Balance Request #${row.id}</b>

👤 User: <code>${row.telegram_id}</code>
💰 Amount: <b>৳${row.amount}</b>
🧾 TxID: <code>${row.txid}</code>
📅 ${row.created_at}`,
      [
        [
          {
            text: "✅ Approve",
            callback_data: `approve_balance:${row.id}`
          },
          {
            text: "❌ Reject",
            callback_data: `reject_balance:${row.id}`
          }
        ]
      ]
    );
  }
}async function showSales(chatId, env) {
  if (String(chatId) !== ADMIN_ID) return;

  const today = await env.DB.prepare(`
    SELECT COUNT(*) AS cards,
           COALESCE(SUM(price), 0) AS money
    FROM orders
    WHERE date(created_at) = date('now')
  `).first();

  const all = await env.DB.prepare(`
    SELECT COUNT(*) AS cards,
           COALESCE(SUM(price), 0) AS money
    FROM orders
  `).first();

  let text = `💰 <b>Sales Report</b>

📅 <b>Today</b>
🎫 Cards Sold: ${today.cards}
💵 Total: ৳${today.money}

📊 <b>All Time</b>
🎫 Cards Sold: ${all.cards}
💵 Total: ৳${all.money}

━━━━━━━━━━━━━━
📦 <b>Package Wise</b>

`;

  for (const pkg of Object.keys(PACKAGES)) {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS cards,
             COALESCE(SUM(price), 0) AS money
      FROM orders
      WHERE package = ?
    `)
      .bind(pkg)
      .first();

    text += `📦 ${pkg}
🎫 ${row.cards} cards — ৳${row.money}

`;
  }

  await sendMessage(
    env,
    chatId,
    text,
    [
      [
        {
          text: "↩️ Back",
          callback_data: "admin"
        }
      ]
    ]
  );
}

async function approveBalanceasync function rejectBalance(requestId, env) {
  const request = await env.DB.prepare(`
    SELECT *
    FROM balance_requests
    WHERE id = ?
    AND status = 'pending'
  `)
    .bind(requestId)
    .first();

  if (!request) {
    return "⚠️ Request already processed.";
  }

  await env.DB.prepare(`
    UPDATE balance_requests
    SET status = 'rejected'
    WHERE id = ?
  `)
    .bind(requestId)
    .run();

  await sendMessage(
    env,
    request.telegram_id,
    `❌ <b>Balance Request Rejected</b>

💰 Amount: ৳${request.amount}

প্রয়োজনে আবার সঠিক তথ্য দিয়ে Request করুন।`
  );

  return "❌ Rejected successfully.";
}

async function handleAdminCallback(chatId, data, env) {
  if (String(chatId) !== ADMIN_ID) return;

  if (data === "admin_stock") {
    return showStock(chatId, env);
  }

  if (data === "admin_pending") {
    return showPending(chatId, env);
  }

  if (data === "admin_sales") {
    return showSales(chatId, env);
  }

  if (data === "admin_voucher") {
    return showVoucherPackages(chatId, env);
  }

  if (data.startsWith("approve_balance:")) {
    const id = data.split(":")[1];
    const result = await approveBalance(id, env);
    return sendMessage(env, chatId, result);
  }

  if (data.startsWith("reject_balance:")) {
    const id = data.split(":")[1];
    const result = await rejectBalance(id, env);
    return sendMessage(env, chatId, result);
  }
}async function showVoucherPackages(chatId, env) {
  if (String(chatId) !== ADMIN_ID) return;

  const buttons = [];

  for (const pkg of Object.keys(PACKAGES)) {
    buttons.push([
      {
        text: `➕ ${pkg}`,
        callback_data: `add_package:${pkg}`
      }
    ]);
  }

  buttons.push([
    {
      text: "↩️ Back",
      callback_data: "admin"
    }
  ]);

  await sendMessage(
    env,
    chatId,
    "➕ <b>Voucher Add</b>\n\nকোন Package-এ Voucher যোগ করবেন?",
    buttons
  );
}

async function showAdminPanel(chatId, env) {
  if (String(chatId) !== ADMIN_ID) return;

  await sendMessage(
    env,
    chatId,
    `👑 <b>Admin Panel</b>

এখান থেকে Bot-এর সব Admin কাজ পরিচালনা করতে পারবেন।`,
    [
      [
        {
          text: "async function handleCallback(query, env) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);
  const data = query.data || "";

  await answerCallback(env, query.id);

  if (data === "buy") {
    return showPackages(chatId, env);
  }

  if (data.startsWith("buy:")) {
    const pkg = data.substring(4);
    return buyPackage(chatId, telegramId, pkg, env);
  }

  if (data === "balance") {
    return showBalance(chatId, env);
  }

  if (data === "addbalance") {
    return addBalanceStart(chatId, telegramId, env);
  }

  if (data === "orders") {
    return showOrders(chatId, telegramId, env);
  }

  if (data === "support") {
    return showSupport(chatId, env);
  }

  if (data === "language") {
    return showLanguage(chatId, env);
  }

  if (data === "back") {
    await clearSession(env, telegramId);
    return mainMenu(chatId, env);
  }

  if (data === "admin") {
    return showAdminPanel(chatId, env);
  }

  if (data === "admin_voucher") {
    return showVoucherPackages(chatId, env);
  }

  if (data === "admin_stock") {
    return showStock(chatId, env);
  }

  if (data === "admin_pending") {
    return showPending(chatId, env);
  }

  if (data === "admin_sales") {
    return showSales(chatId, env);
  }

  if (data.startsWith("add_package:")) {
    if (telegramId !== ADMIN_ID) return;

    const pkg = data.substring(12);

    await setSession(
      env,
      telegramId,
      "voucher_add",
      { package: pkg }
    );

    return sendMessage(
      env,
      chatId,
      `➕ <b>Voucher Add</b>

📦 Package: <b>${pkg}</b>

প্রতিটি Voucher Code আলাদা লাইনে পাঠান।

সব Code শেষ হলে <code>/done</code> লিখুন।`
    );
  }

  if (data.startsWith("approve_balance:")) {
    if (telegramId !== ADMIN_ID) return;

    const id = data.substring(16);
    const result = await approveBalance(id, env);

    return sendMessage(env, chatId, result);
  }

  if (data.startsWith("reject_balance:")) {
    if (telegramId !== ADMIN_ID) return;

    const id = data.substring(15);
    const result = await rejectBalance(id, env);

    return sendMessage(env, chatId, result);
  }

  if (data === "lang:bn" || data === "lang:en") {
    const lang = data === "lang:bn" ? "bn" : "en";

    await env.DB.prepare(`
      UPDATE users
      SET language = ?
      WHERE telegram_id = ?
    `)
      .bind(lang, telegramId)
      .run();

    return mainMenu(chatId, env);
  }
}


async function answerCallback(env, callbackId) {
  return telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callbackId
    },
    env
  );
      }
