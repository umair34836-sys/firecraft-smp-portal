require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const WEBSITE = process.env.WEBSITE_URL || "https://firecraft-smp-portal.web.app";
const WELCOME_CHANNEL = process.env.WELCOME_CHANNEL_ID;
const REMINDER_CHANNEL = process.env.REMINDER_CHANNEL_ID;
const REMINDER_HOURS = parseInt(process.env.REMINDER_INTERVAL_HOURS || "12");

// Keywords that trigger the IP/website auto-reply
const IP_KEYWORDS = ["server ip", "ip address", "what is the ip", "whats the ip", "ip kya", "ip do", "ip batao", "ip bta", "address"];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// ─── Bot ready ────────────────────────────────────────────────────────────────

client.once("ready", () => {
  console.log(`[FireCraftBot] Logged in as ${client.user.tag}`);
  scheduleReminders();
});

// ─── New member joins ─────────────────────────────────────────────────────────

client.on("guildMemberAdd", async (member) => {
  // 1. Public welcome in the welcome channel
  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL);
  if (welcomeChannel) {
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0xff3b30)
      .setTitle("🔥 Welcome to FireCraft SMP!")
      .setDescription(`Hey ${member}, glad you're here! 🎮\nCheck your DMs for steps on how to join the server.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: "FireCraft SMP • firecraft-smp-portal.web.app" });

    await welcomeChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
  }

  // 2. Detailed A-to-Z guide via DM
  const dmEmbed = new EmbedBuilder()
    .setColor(0xff8a00)
    .setTitle("🔥 How to Join FireCraft SMP — Step by Step")
    .setDescription("Follow these steps to get whitelisted and join our Minecraft server:")
    .addFields(
      {
        name: "1️⃣  Visit the Website",
        value: `Go to **[${WEBSITE}](${WEBSITE})**`,
      },
      {
        name: "2️⃣  Create an Account",
        value: "Click **Login** → then **Sign Up**.\nUse any email and set your **Minecraft IGN** (in-game name) during registration.",
      },
      {
        name: "3️⃣  Submit a Whitelist Application",
        value: "Click **Apply** in the navigation bar.\nFill in your details honestly — age, why you want to join, your experience, etc.",
      },
      {
        name: "4️⃣  Wait for Approval",
        value: "An admin will review your application.\n✅ Approval usually takes **up to 24 hours**.\nYou can check your status anytime under **My Status** on the website.",
      },
      {
        name: "5️⃣  Get the Server IP",
        value: `Once approved, the **server IP** will be visible on the website homepage.\n👉 ${WEBSITE}`,
      },
      {
        name: "❓ Need Help?",
        value: `Open a support ticket on the website or ask in our Discord channels.`,
      }
    )
    .setFooter({ text: "FireCraft SMP — See you in-game! 🎮" });

  await member.send({ embeds: [dmEmbed] }).catch(() => {
    // DMs might be closed — silently ignore
    console.log(`[FireCraftBot] Could not DM ${member.user.tag} (DMs closed)`);
  });
});

// ─── Auto-reply to IP / website questions ────────────────────────────────────

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const askedForIP = IP_KEYWORDS.some((kw) => content.includes(kw));

  if (askedForIP) {
    const replyEmbed = new EmbedBuilder()
      .setColor(0xff3b30)
      .setTitle("🔥 Server IP — Visit the Website!")
      .setDescription(
        `The server IP is available on our website after your whitelist application is approved.\n\n` +
        `👉 **[${WEBSITE}](${WEBSITE})**\n\n` +
        `Not whitelisted yet? Click **Apply** on the website to submit your application!`
      )
      .setFooter({ text: "FireCraft SMP" });

    await message.reply({ embeds: [replyEmbed] }).catch(() => {});
  }
});

// ─── Periodic reminders ───────────────────────────────────────────────────────

function scheduleReminders() {
  if (!REMINDER_CHANNEL) {
    console.log("[FireCraftBot] REMINDER_CHANNEL_ID not set — skipping reminders.");
    return;
  }

  const intervalMs = REMINDER_HOURS * 60 * 60 * 1000;

  setInterval(async () => {
    const channel = client.channels.cache.get(REMINDER_CHANNEL);
    if (!channel) return;

    const reminderEmbed = new EmbedBuilder()
      .setColor(0xff3b30)
      .setTitle("🔥 Stay Updated — Visit the FireCraft Website!")
      .setDescription(
        `Check out our website for the latest announcements, events, and updates!\n\n` +
        `👉 **[${WEBSITE}](${WEBSITE})**\n\n` +
        `Not whitelisted yet? Apply now and join the SMP! 🎮`
      )
      .setFooter({ text: `FireCraft SMP • Reminder every ${REMINDER_HOURS}h` });

    await channel.send({ embeds: [reminderEmbed] }).catch((e) => {
      console.warn("[FireCraftBot] Could not send reminder:", e.message);
    });
  }, intervalMs);

  console.log(`[FireCraftBot] Reminders scheduled every ${REMINDER_HOURS} hour(s).`);
}

// ─── Start ────────────────────────────────────────────────────────────────────

client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error("[FireCraftBot] Login failed:", err.message);
  process.exit(1);
});
