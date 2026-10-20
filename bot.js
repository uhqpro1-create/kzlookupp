// ============================================================
// ѲsSearch - Discord Bot (Admin Commands)
// ============================================================

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'ossearch.db'));
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';

// Hardcoded Owners
const OWNER_IDS = [
    '1452004330180968712'
];

if (!TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN manquant dans .env');
    return; // Don't crash the whole server
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        // GatewayIntentBits.GuildMembers, // Removed due to 'Used disallowed intents' error. Enable in Discord Dev Portal first.
    ]
});

// Role to Plan Mapping (Update IDs with your actual Discord Role IDs)
const ROLE_TO_PLAN = {
    '123456789012345678': 'premiumhq',
    '876543210987654321': 'pro',
    '112233445566778899': 'beginner'
};
// Role to Role/Rank Mapping (Founder/Staff/etc)
const ROLE_TO_RANK = {
    '998877665544332211': 'owner',
    '223344556677889900': 'staff',
    '334455667788990011': 'admin'
};

// ============================================================
// SLASH COMMANDS DEFINITIONS
// ============================================================
const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Afficher la liste des commandes et l\'aide'),

    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Lier votre compte Discord à ѲsSearch')
        .addStringOption(o => o.setName('uuid').setDescription('Votre UUID (trouvable sur le site)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('search')
        .setDescription('Effectuer une recherche Lookup2BZ')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('query').setDescription('Terme de recherche').setRequired(true)),

    new SlashCommandBuilder()
        .setName('addcredits')
        .setDescription('Ajouter des crédits (via UUID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('uuid').setDescription('UUID de l\'utilisateur').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Nombre de crédits').setRequired(true)),

    new SlashCommandBuilder()
        .setName('addsub')
        .setDescription('Attribuer un plan (via UUID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('uuid').setDescription('UUID de l\'utilisateur').setRequired(true))
        .addStringOption(o => o.setName('plan').setDescription('Plan').setRequired(true)
            .addChoices(
                { name: 'Free', value: 'free' },
                { name: 'Beginner', value: 'beginner' },
                { name: 'Professional', value: 'pro' },
                { name: 'PremiumHQ', value: 'premiumhq' }
            )),

    new SlashCommandBuilder()
        .setName('deleteaccount')
        .setDescription('Supprimer un compte (via UUID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('uuid').setDescription('UUID de l\'utilisateur').setRequired(true)),

    new SlashCommandBuilder()
        .setName('blacklistip')
        .setDescription('Blacklister une adresse IP')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('ip').setDescription('Adresse IP').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison du blacklist')),

    new SlashCommandBuilder()
        .setName('avis')
        .setDescription('Laisser un avis sur OsSearch')
        .addStringOption(o => o.setName('commentaire').setDescription('Votre avis sur le site').setRequired(true))
        .addIntegerOption(o => o.setName('etoiles').setDescription('Note sur 5 étoiles').setRequired(true)
            .addChoices(
                { name: '⭐', value: 1 },
                { name: '⭐⭐', value: 2 },
                { name: '⭐⭐⭐', value: 3 },
                { name: '⭐⭐⭐⭐', value: 4 },
                { name: '⭐⭐⭐⭐⭐', value: 5 }
            )),

    new SlashCommandBuilder()
        .setName('unblacklistip')
        .setDescription('Retirer une IP du blacklist')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('ip').setDescription('Adresse IP').setRequired(true)),


    new SlashCommandBuilder()
        .setName('owner')
        .setDescription('Définir un utilisateur comme owner (via UUID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('uuid').setDescription('UUID de l\'utilisateur').setRequired(true)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Voir les statistiques du site')
        .setDefaultMemberPermissions(0),

    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Voir les infos d\'un utilisateur (via UUID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('uuid').setDescription('UUID de l\'utilisateur').setRequired(true)),

    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Synchroniser les rôles/plans d\'un utilisateur (via UUID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('uuid').setDescription('UUID de l\'utilisateur (Optionnel)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setgrade')
        .setDescription('Définir le grade/plan (via UUID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('uuid').setDescription('UUID de l\'utilisateur').setRequired(true))
        .addStringOption(o => o.setName('grade').setDescription('Grade (owner/admin/staff/premiumhq/pro/beginner/free)').setRequired(true)
            .addChoices(
                { name: 'Owner', value: 'owner' },
                { name: 'Admin', value: 'admin' },
                { name: 'Staff', value: 'staff' },
                { name: 'PremiumHQ', value: 'premiumhq' },
                { name: 'Professional', value: 'pro' },
                { name: 'Beginner', value: 'beginner' },
                { name: 'Free', value: 'free' }
            )),

    new SlashCommandBuilder()
        .setName('blocksearch')
        .setDescription('Bloquer une recherche (furtif)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('term').setDescription('Terme à bloquer').setRequired(true)),

    new SlashCommandBuilder()
        .setName('unblocksearch')
        .setDescription('Débloquer une recherche')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('term').setDescription('Terme à débloquer').setRequired(true)),

    new SlashCommandBuilder()
        .setName('listblocked')
        .setDescription('Lister les termes de recherche bloqués')
        .setDefaultMemberPermissions(0),

    new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Configurer l\'autorole (donné aux nouveaux membres)')
        .setDefaultMemberPermissions(0)
        .addRoleOption(o => o.setName('role').setDescription('Le rôle à donner automatiquement').setRequired(true)),

    new SlashCommandBuilder()
        .setName('antiraid')
        .setDescription('Activer/Désactiver la protection anti-raid')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('status').setDescription('Status (on/off)').setRequired(true)
            .addChoices(
                { name: 'Activé', value: 'on' },
                { name: 'Désactivé', value: 'off' }
            )),

    new SlashCommandBuilder()
        .setName('deletereview')
        .setDescription('Supprimer un avis (via Discord ID)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('discord_id').setDescription('L\'ID Discord de l\'auteur de l\'avis').setRequired(true)),
];

// ============================================================
// REGISTER COMMANDS
// ============================================================
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('📡 Enregistrement des commandes slash...');
        if (CLIENT_ID) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(c => c.toJSON()) });
            console.log('✅ Commandes enregistrées globalement.');
        } else {
            console.log('⚠️  DISCORD_CLIENT_ID manquant, commandes non enregistrées. Ajoutez-le dans .env');
        }
    } catch (err) {
        console.error('❌ Erreur lors de l\'enregistrement des commandes:', err);
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
const planCredits = { free: 5, beginner: 100, pro: 500, premiumhq: 5000 };

function getUser(id) {
    return db.prepare('SELECT * FROM users WHERE uuid = ?').get(id);
}

function embed(title, description, color = 0xff1a1a) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'ѲsSearch Admin' });
}

async function syncUserRoles(discordId, guild) {
    try {
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) return null;

        const dbUser = db.prepare('SELECT id, plan, role, avatar_url FROM users WHERE discord_id = ?').get(discordId);
        if (!dbUser) return null;

        let newPlan = dbUser.plan || 'free';
        let newRole = dbUser.role || 'user';

        // Only overwrite with Discord roles if we FIND a match. 
        // This prevents resetting people to 'free' just because they don't have a specific Discord role.
        let foundRoleMatch = false;
        let foundPlanMatch = false;

        // Check for Rank roles (Owner/Staff/Admin)
        for (const [roleId, rank] of Object.entries(ROLE_TO_RANK)) {
            if (member.roles.cache.has(roleId)) {
                newRole = rank;
                foundRoleMatch = true;
                // If it's a high rank, maybe they get PremiumHQ by default?
                if (rank === 'owner' || rank === 'admin') {
                    newPlan = 'premiumhq';
                    foundPlanMatch = true;
                }
            }
        }

        // Check for subscription roles
        for (const [roleId, plan] of Object.entries(ROLE_TO_PLAN)) {
            if (member.roles.cache.has(roleId)) {
                newPlan = plan;
                foundPlanMatch = true;
            }
        }

        // Get Avatar
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });

        // Update database if changed. 
        // We only proceed if at least one sync-managed attribute changed and we are confident in the update.
        if (newPlan !== dbUser.plan || newRole !== dbUser.role || avatarUrl !== dbUser.avatar_url) {
            const credits = planCredits[newPlan] || 5;
            db.prepare('UPDATE users SET plan = ?, role = ?, credits = ?, credits_max = ?, avatar_url = ? WHERE id = ?')
                .run(newPlan, newRole, credits, credits, avatarUrl, dbUser.id);
            return { plan: newPlan, role: newRole, avatarUrl };
        }
    } catch (err) {
        console.error('Error syncing roles:', err.message);
    }
    return null;
}

async function syncAllUsers() {
    console.log('[Bot] Starting periodic synchronization of all users...');
    try {
        const users = db.prepare('SELECT discord_id FROM users WHERE discord_id != ?').all('');
        // Get the first guild the bot is in
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.log('[Bot] No guilds found for sync.');
            return;
        }

        for (const user of users) {
            await syncUserRoles(user.discord_id, guild);
            // Small delay to avoid hitting rate limits
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log('[Bot] Periodic sync completed.');
    } catch (err) {
        console.error('[Bot] Periodic sync error:', err.message);
    }
}

// ============================================================
// COMMAND HANDLER
// ============================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // OWNER CHECK
    const isHardcodedOwner = OWNER_IDS.includes(interaction.user.id);
    const dbUser = db.prepare('SELECT role FROM users WHERE discord_id = ?').get(interaction.user.id);
    const isDBOwner = dbUser && (dbUser.role === 'owner' || dbUser.role === 'admin');
    const isAdminUser = isHardcodedOwner || isDBOwner;

    const { commandName } = interaction;

    // RESTRICT ADMIN COMMANDS IN LOGIC
    const publicCommands = ['help', 'link', 'search'];
    if (commandName === 'listblocked') {
        if (interaction.user.id !== '1459346147020902477') {
            return interaction.reply({
                embeds: [embed('🚫 Accès Refusé', 'Cette commande est strictement réservée au responsable des paiements.', 0xff4444)],
                ephemeral: true
            });
        }
    } else if (!publicCommands.includes(commandName) && !isAdminUser) {
        return interaction.reply({
            embeds: [embed('🚫 Accès Refusé', 'Vous n\'êtes pas autorisé à utiliser ce bot. Seuls les **Owners** et **Admins** liés peuvent exécuter ces commandes.', 0xff4444)],
            ephemeral: true
        });
    }

    try {
        switch (commandName) {
            case 'help': {
                const logo = new AttachmentBuilder(path.join(__dirname, 'LOGO', 'logo.png'));
                const banner = new AttachmentBuilder(path.join(__dirname, 'LOGO', 'banner.png'));

                const helpEmbed = new EmbedBuilder()
                    .setTitle('📚 ѲsSearch - Manuel d\'utilisation')
                    .setColor(0x5865F2)
                    .setThumbnail('attachment://logo.png')
                    .setImage('attachment://banner.png')
                    .setFooter({ text: 'ѲsSearch Security • Version 2.2.0' })
                    .setTimestamp();

                if (isAdminUser) {
                    helpEmbed.setDescription('Voici la liste des commandes disponibles pour la gestion de la plateforme. Seuls les administrateurs et owners peuvent les utiliser.')
                        .addFields(
                            { name: '🔗 /link <uuid>', value: 'Lier son compte Discord au site' },
                            { name: '🔍 /search <query>', value: 'Effectue une recherche brute (Lookup2BZ API)' },
                            { name: '💎 /addsub <uuid> <plan>', value: 'Change le plan d\'un utilisateur (via UUID)' },
                            { name: '🔋 /addcredits <uuid> <amount>', value: 'Ajoute des crédits à un utilisateur' },
                            { name: '👤 /userinfo <uuid>', value: 'Affiche les informations détaillés d\'un membre' },
                            { name: '📊 /stats', value: 'Affiche les statistiques globales de ѲsSearch' },
                            { name: '🚫 /blacklistip <ip> [reason]', value: 'Bannit une adresse IP du site' },
                            { name: '✅ /unblacklistip <ip>', value: 'Débannit une adresse IP' },
                            { name: '🗑️ /deleteaccount <uuid>', value: 'Supprime définitivement un compte' },
                            { name: '👑 /owner <uuid>', value: 'Définit un utilisateur comme Owner' },
                            { name: '🤐 /blocksearch <term>', value: 'Censure un terme (furtif)' },
                            { name: '🔓 /unblocksearch <term>', value: 'Lève la censure sur un terme' },
                            { name: '📜 /listblocked', value: 'Liste les termes censurés (Exclusif)' }
                        );
                } else {
                    helpEmbed.setDescription('Bienvenue sur le bot ѲsSearch. Voici vos commandes :')
                        .addFields(
                            { name: '🔗 /link <uuid>', value: "Lier votre compte Discord à votre compte web ѲsSearch (l'UUID est sur votre profil)." }
                        );
                }

                await interaction.reply({ embeds: [helpEmbed], files: [logo, banner] });
                break;
            }

            case 'link': {
                const uuid = interaction.options.getString('uuid');
                const discordId = interaction.user.id;
                const discordTag = interaction.user.tag;

                const user = db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid);
                if (!user) {
                    return interaction.reply({ embeds: [embed('❌ Erreur', 'UUID introuvable. Veuillez vérifier sur votre profil du site.')], ephemeral: true });
                }

                if (user.discord_id === discordId) {
                    return interaction.reply({ embeds: [embed('⚠️ Info', 'Votre compte est déjà lié à ce profil !')], ephemeral: true });
                }

                db.prepare('UPDATE users SET discord_id = ?, discord_tag = ? WHERE uuid = ?').run(discordId, discordTag, uuid);
                
                // Trigger an initial sync right away to fetch their roles and avatar
                const guild = interaction.guild;
                if (guild) await syncUserRoles(discordId, guild);

                await interaction.reply({
                    embeds: [embed('🔗 Compte Lié', `Succès ! Votre compte Discord a été lié au profil **${user.username}**.\nVos rôles et avantages seront automatiquement synchronisés.`, 0x00ff88)],
                    ephemeral: true
                });
                break;
            }

            case 'search': {
                const query = interaction.options.getString('query');
                await interaction.deferReply();

                try {
                    const encodedQuery = encodeURIComponent(query);
                    const apiResp = await fetch(`https://api.lookup2bz.xyz/api/v1/query?query=${encodedQuery}&limit=150`, {
                        method: 'GET',
                        headers: {
                            'X-API-Key': process.env.LOOKUP2BZ_API_KEY
                        }
                    });
                    const apiData = await apiResp.json();
                    const results = apiData.results || [];

                    if (results.length === 0) {
                        return interaction.editReply({ embeds: [embed('🔍 Recherche', `Aucun résultat pour **${query}**`)] });
                    }

                    const topResults = results.slice(0, 5); // Limit to top 5 for Discord embed
                    const resultsEmbed = new EmbedBuilder()
                        .setTitle(`🔍 Résultats pour : ${query}`)
                        .setDescription(`Voici les 5 premiers résultats trouvés (Total: ${apiData.count || results.length})\nTemps: ${apiData.time_ms || 0}ms`)
                        .setColor(0x5865F2)
                        .setTimestamp();

                    topResults.forEach((res, i) => {
                        let content = '';
                        const data = res.data || {};
                        const source = res.source || 'Inconnu';

                        // Add source
                        content += `📂 **Source**: \`${source}\`\n`;

                        // Process data based on structure
                        Object.entries(data).slice(0, 6).forEach(([k, v]) => {
                            if (v && v !== null && v !== '' && typeof v !== 'object') {
                                content += `**${k}**: \`${v}\`\n`;
                            } else if (typeof v === 'object' && v !== null) {
                                const objStr = JSON.stringify(v).slice(0, 100);
                                content += `**${k}**: \`${objStr}...\`\n`;
                            }
                        });

                        resultsEmbed.addFields({ name: `Résultat #${i + 1}`, value: content || 'Données brutes...', inline: false });
                    });

                    await interaction.editReply({ embeds: [resultsEmbed] });
                } catch (err) {
                    console.error('Bot Search Error:', err);
                    await interaction.editReply({ embeds: [embed('❌ Erreur', 'Impossible de contacter l\'API de recherche.')] });
                }
                break;
            }

            case 'addcredits': {
                const uuid = interaction.options.getString('uuid');
                const amount = interaction.options.getInteger('amount');
                const user = getUser(uuid);
                if (!user) return interaction.reply({ embeds: [embed('❌ Erreur', `Utilisateur avec l'UUID **${uuid}** introuvable.`)], ephemeral: true });

                db.prepare('UPDATE users SET credits = credits + ? WHERE uuid = ?').run(amount, uuid);
                const updated = getUser(uuid);
                await interaction.reply({
                    embeds: [embed('✅ Crédits Ajoutés', `**${user.username}** a reçu **${amount}** crédits.\nTotal: **${updated.credits}** crédits.`, 0x00ff88)]
                });
                break;
            }

            case 'addsub': {
                const uuid = interaction.options.getString('uuid');
                const plan = interaction.options.getString('plan');
                const user = getUser(uuid);
                if (!user) return interaction.reply({ embeds: [embed('❌ Erreur', `Utilisateur avec l'UUID **${uuid}** introuvable.`)], ephemeral: true });

                const credits = planCredits[plan] || 5;
                db.prepare('UPDATE users SET plan = ?, credits = ?, credits_max = ? WHERE uuid = ?').run(plan, credits, credits, uuid);
                await interaction.reply({
                    embeds: [embed('✅ Plan Mis à Jour', `**${user.username}** → Plan **${plan.toUpperCase()}** (${credits} crédits/jour)`, 0x3498db)]
                });
                break;
            }

            case 'setgrade': {
                const uuid = interaction.options.getString('uuid');
                const grade = interaction.options.getString('grade');
                const user = getUser(uuid);
                if (!user) return interaction.reply({ embeds: [embed('❌ Erreur', `Utilisateur avec l'UUID **${uuid}** introuvable.`)], ephemeral: true });

                const roles = ['owner', 'admin', 'staff'];
                const plans = ['premiumhq', 'pro', 'beginner', 'free'];

                if (roles.includes(grade)) {
                    db.prepare('UPDATE users SET role = ? WHERE uuid = ?').run(grade, uuid);
                    const roleEmojis = { owner: '👑', admin: '⚖️', staff: '🛡️' };
                    const emoji = roleEmojis[grade] || '✅';
                    await interaction.reply({
                        embeds: [embed(`${emoji} Grade Mis à Jour`, `**${user.username}** → Grade **${grade.toUpperCase()}**`, 0xff4444)]
                    });
                } else if (plans.includes(grade)) {
                    const credits = planCredits[grade] || 5;
                    const planEmojis = { premiumhq: '⚜️', pro: '⚡', beginner: '⭐', free: '👥' };
                    const planColors = { premiumhq: 0xFFCC00, pro: 0xFFD700, beginner: 0xDAA520, free: 0x808080 };
                    const emoji = planEmojis[grade] || '💎';
                    const color = planColors[grade] || 0x3498db;
                    db.prepare('UPDATE users SET plan = ?, credits = ?, credits_max = ? WHERE uuid = ?').run(grade, credits, credits, uuid);
                    await interaction.reply({
                        embeds: [embed(`${emoji} Plan Mis à Jour`, `**${user.username}** → Plan **${grade.toUpperCase()}** (${credits} crédits/jour)`, color)]
                    });
                }
                break;
            }

            case 'deleteaccount': {
                const uuid = interaction.options.getString('uuid');
                const user = getUser(uuid);
                if (!user) return interaction.reply({ embeds: [embed('❌ Erreur', `Utilisateur avec l'UUID **${uuid}** introuvable.`)], ephemeral: true });

                db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
                db.prepare('DELETE FROM search_logs WHERE user_id = ?').run(user.id);
                db.prepare('DELETE FROM connection_logs WHERE user_id = ?').run(user.id);
                db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

                await interaction.reply({
                    embeds: [embed('🗑️ Compte Supprimé', `Le compte de **${user.username}** (${user.email}) a été supprimé.`, 0xff4444)]
                });
                break;
            }

            case 'blacklistip': {
                const ip = interaction.options.getString('ip');
                const reason = interaction.options.getString('reason') || 'Blacklisté via Discord';

                const exists = db.prepare('SELECT * FROM blacklisted_ips WHERE ip = ?').get(ip);
                if (exists) return interaction.reply({ embeds: [embed('⚠️ Info', `L'IP **${ip}** est déjà blacklistée.`)], ephemeral: true });

                db.prepare('INSERT INTO blacklisted_ips (ip, reason) VALUES (?, ?)').run(ip, reason);
                await interaction.reply({
                    embeds: [embed('🚫 IP Blacklistée', `**${ip}**\nRaison: ${reason}`, 0xff0000)]
                });
                break;
            }

            case 'unblacklistip': {
                const ip = interaction.options.getString('ip');
                const exists = db.prepare('SELECT * FROM blacklisted_ips WHERE ip = ?').get(ip);
                if (!exists) return interaction.reply({ embeds: [embed('⚠️ Info', `L'IP **${ip}** n'est pas blacklistée.`)], ephemeral: true });

                db.prepare('DELETE FROM blacklisted_ips WHERE ip = ?').run(ip);
                await interaction.reply({
                    embeds: [embed('✅ IP Retirée', `**${ip}** a été retirée du blacklist.`, 0x00ff88)]
                });
                break;
            }


            case 'owner': {
                const uuid = interaction.options.getString('uuid');
                const user = getUser(uuid);
                if (!user) return interaction.reply({ embeds: [embed('❌ Erreur', `Utilisateur avec l'UUID **${uuid}** introuvable.`)], ephemeral: true });

                db.prepare('UPDATE users SET role = ? WHERE uuid = ?').run('owner', uuid);
                await interaction.reply({
                    embeds: [embed('👑 Owner Défini', `**${user.username}** est maintenant **OWNER**.`, 0xf1c40f)]
                });
                break;
            }

            case 'blocksearch': {
                const term = interaction.options.getString('term').toLowerCase();
                try {
                    db.prepare('INSERT INTO search_blacklist (term) VALUES (?)').run(term);
                    await interaction.reply({
                        embeds: [embed('🚫 Recherche Bloquée', `Le terme **"${term}"** a été ajouté à la blacklist furtive.`, 0xff0000)]
                    });
                } catch (e) {
                    if (e.message.includes('UNIQUE constraint failed')) {
                        await interaction.reply({ embeds: [embed('⚠️ Info', `Le terme **"${term}"** est déjà bloqué.`)], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [embed('❌ Erreur', "Erreur lors de l'ajout à la blacklist.")], ephemeral: true });
                    }
                }
                break;
            }

            case 'unblocksearch': {
                const term = interaction.options.getString('term').toLowerCase();
                const info = db.prepare('DELETE FROM search_blacklist WHERE term = ?').run(term);
                if (info.changes > 0) {
                    await interaction.reply({
                        embeds: [embed('✅ Recherche Débloquée', `Le terme **"${term}"** a été retiré de la blacklist.`, 0x00ff88)]
                    });
                } else {
                    await interaction.reply({ embeds: [embed('⚠️ Info', `Le terme **"${term}"** n'était pas bloqué.`)], ephemeral: true });
                }
                break;
            }

            case 'deletereview': {
                const discordId = interaction.options.getString('discord_id');
                await interaction.deferReply({ ephemeral: true });

                try {
                    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 26005}/api/internal/review/${discordId}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            key: process.env.INTERNAL_BOT_KEY || 'ossearch_internal_secure_key_2024'
                        })
                    });

                    const data = await res.json();
                    if (data.success && data.changes > 0) {
                        await interaction.followUp({
                            embeds: [embed('✅ Avis Supprimé', `L'avis de l'utilisateur avec l'ID **${discordId}** a été supprimé du site.`, 0x00ff88)],
                            ephemeral: true
                        });
                    } else {
                        await interaction.followUp({
                            embeds: [embed('⚠️ Info', `Aucun avis trouvé pour l'ID Discord **${discordId}**.`, 0xffcc00)],
                            ephemeral: true
                        });
                    }
                } catch (e) {
                    console.error('Bot /deletereview error:', e);
                    await interaction.followUp({ embeds: [embed('❌ Erreur', `Impossible de supprimer l'avis: ${e.message}`)], ephemeral: true });
                }
                break;
            }

            case 'listblocked': {
                const terms = db.prepare('SELECT term, added_by, created_at FROM search_blacklist ORDER BY created_at DESC').all();
                if (terms.length === 0) {
                    return interaction.reply({ embeds: [embed('ℹ️ Liste Noire', 'Aucun terme bloqué actuellement.', 0x3498db)] });
                }
                const termList = terms.map(t => `• **${t.term}**`).join('\n');
                await interaction.reply({
                    embeds: [embed('🚫 Termes Bloqués', `Voici les termes actuellement bloqués en mode furtif :\n\n${termList}`, 0xff1a1a)]
                });
                break;
            }

            case 'stats': {
                const now = Date.now();
                const d24h = now - 86400000;
                const d1h = now - 3600000;

                const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
                const todayUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE created_at > ?').get(new Date(d24h).toISOString()).c;
                const hourUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE created_at > ?').get(new Date(d1h).toISOString()).c;
                const todaySearches = db.prepare('SELECT COUNT(*) as c FROM search_logs WHERE timestamp > ?').get(new Date(d24h).toISOString()).c;
                const todayLogins = db.prepare('SELECT COUNT(*) as c FROM connection_logs WHERE timestamp > ?').get(new Date(d24h).toISOString()).c;

                let todayPayments = 0;
                try {
                    const p = db.prepare('SELECT SUM(amount) as total FROM payment_logs WHERE timestamp > ?').get(new Date(d24h).toISOString());
                    todayPayments = p?.total || 0;
                } catch (e) { }

                const blacklisted = db.prepare('SELECT COUNT(*) as c FROM blacklisted_ips').get().c;

                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle('📊 Statistiques ѲsSearch')
                        .setColor(0xff1a1a)
                        .addFields(
                            { name: '👥 Total Utilisateurs', value: `${totalUsers}`, inline: true },
                            { name: '🆕 Nouveaux (24h)', value: `${todayUsers}`, inline: true },
                            { name: '⏰ Nouveaux (1h)', value: `${hourUsers}`, inline: true },
                            { name: '🔍 Recherches (24h)', value: `${todaySearches}`, inline: true },
                            { name: '🔑 Connexions (24h)', value: `${todayLogins}`, inline: true },
                            { name: '💰 Revenus (24h)', value: `€${Number(todayPayments).toFixed(2)}`, inline: true },
                            { name: '🚫 IPs Blacklistées', value: `${blacklisted}`, inline: true },
                        )
                        .setTimestamp()
                        .setFooter({ text: 'ѲsSearch Admin' })
                    ]
                });
                break;
            }

            case 'userinfo': {
                const uuid = interaction.options.getString('uuid');
                const user = getUser(uuid);
                if (!user) return interaction.reply({ embeds: [embed('❌ Erreur', `Utilisateur avec l'UUID **${uuid}** introuvable.`)], ephemeral: true });

                const searchCount = db.prepare('SELECT COUNT(*) as c FROM search_logs WHERE user_id = ?').get(user.id).c;

                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`👤 ${user.username}`)
                        .setColor(0xff1a1a)
                        .addFields(
                            { name: '🔑 UUID', value: user.uuid || 'N/A', inline: false },
                            { name: '📧 Email', value: user.email || 'N/A', inline: true },
                            { name: '💎 Plan', value: user.plan?.toUpperCase() || 'FREE', inline: true },
                            { name: '🎭 Rôle', value: user.role || 'user', inline: true },
                            { name: '🔋 Crédits', value: `${user.credits}/${user.credits_max}`, inline: true },
                            { name: '🔍 Recherches', value: `${searchCount}`, inline: true },
                            { name: '🆔 Discord ID', value: user.discord_id || 'Non lié', inline: true },
                            { name: '📅 Créé le', value: user.created_at || 'N/A', inline: true },
                        )
                        .setTimestamp()
                        .setFooter({ text: 'ѲsSearch Admin' })
                    ]
                });
                break;
            }

            case 'sync': {
                let uuid = interaction.options.getString('uuid');
                let targetDiscordId;
                let user;

                if (uuid) {
                    user = getUser(uuid);
                    if (!user) return interaction.reply({ embeds: [embed('❌ Erreur', `Utilisateur avec l'UUID **${uuid}** introuvable.`)], ephemeral: true });
                    targetDiscordId = user.discord_id;
                    if (!targetDiscordId) return interaction.reply({ embeds: [embed('⚠️ Info', `L'utilisateur **${user.username}** n'a pas lié son compte Discord sur le site.`)], ephemeral: true });
                } else {
                    // Sync the person running the command
                    targetDiscordId = interaction.user.id;
                    user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(targetDiscordId);
                    if (!user) return interaction.reply({ embeds: [embed('⚠️ Info', `Votre compte Discord n'est pas lié à un compte sur le site.`)], ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });
                const result = await syncUserRoles(targetDiscordId, interaction.guild);

                if (result) {
                    await interaction.followUp({
                        embeds: [embed('🔄 Synchronisation Réussie', `Utilisateur: **${user.username}**\nNouveau Plan: **${result.plan.toUpperCase()}**\nNouveau Grade: **${result.role.toUpperCase()}**`, 0x00ff88)]
                    });
                } else {
                    await interaction.followUp({
                        embeds: [embed('⚠️ Synchronisation', `Aucun changement détecté pour **${user.username}**.`, 0xf1c40f)]
                    });
                }
                break;
            }

            case 'avis': {
                const content = interaction.options.getString('commentaire');
                const stars = interaction.options.getInteger('etoiles');
                const username = interaction.user.username;
                const discordId = interaction.user.id;

                await interaction.deferReply({ ephemeral: true });

                try {
                    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 26005}/api/internal/review`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            key: process.env.INTERNAL_BOT_KEY || 'ossearch_internal_secure_key_2024',
                            username: username,
                            discord_id: discordId,
                            content: content,
                            stars: stars
                        })
                    });

                    const data = await res.json();
                    if (data.success) {
                        await interaction.followUp({
                            embeds: [new EmbedBuilder()
                                .setTitle('✅ Avis Enregistré !')
                                .setColor(0x00ff88)
                                .setDescription(`Merci pour votre retour, **${username}** !\nVotre avis est maintenant visible sur le site.`)
                                .addFields(
                                    { name: 'Note', value: '⭐'.repeat(stars), inline: true },
                                    { name: 'Avis', value: content }
                                )
                                .setTimestamp()
                            ]
                        });
                    } else {
                        throw new Error(data.error || 'Erreur API');
                    }
                } catch (e) {
                    console.error('Bot /avis error:', e);
                    await interaction.followUp({ embeds: [embed('❌ Erreur', `Impossible d'enregistrer votre avis: ${e.message}`)], ephemeral: true });
                }
                break;
            }

            case 'autorole': {
                const role = interaction.options.getRole('role');
                db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)').run('autorole_id', role.id);
                await interaction.reply({ embeds: [embed('✅ Autorole Configuré', `Le rôle ${role} sera désormais donné aux nouveaux membres.`, 0x00ff88)], ephemeral: true });
                break;
            }

            case 'antiraid': {
                const status = interaction.options.getString('status');
                db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)').run('antiraid_status', status);
                await interaction.reply({ embeds: [embed('🛡️ Anti-Raid', `La protection anti-raid est maintenant **${status === 'on' ? 'ACTIVÉE' : 'DÉSACTIVÉE'}**.`, status === 'on' ? 0x00ff88 : 0xff4444)], ephemeral: true });
                break;
            }
        }
    } catch (err) {
        console.error(`Erreur commande ${commandName}:`, err);
        if (!interaction.replied) {
            await interaction.reply({ embeds: [embed('❌ Erreur', `Une erreur est survenue: ${err.message}`)], ephemeral: true });
        }
    }
});

// ============================================================
// ANTI-RAID & AUTOROLE EVENTS
// ============================================================
const joinLog = new Map(); // Store join timestamps for anti-raid

client.on('guildMemberAdd', async (member) => {
    // 1. AUTOROLE
    try {
        const autoroleSetting = db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('autorole_id');
        if (autoroleSetting && autoroleSetting.value) {
            const role = member.guild.roles.cache.get(autoroleSetting.value);
            if (role) {
                await member.roles.add(role).catch(err => console.error(`[Autorole] Erreur ajout rôle: ${err.message}`));
                console.log(`[Autorole] Rôle ${role.name} donné à ${member.user.tag}`);
            }
        }
    } catch (err) {
        console.error('[Autorole] Erreur:', err.message);
    }

    // 2. ANTI-RAID
    try {
        const antiRaidSetting = db.prepare('SELECT value FROM bot_settings WHERE key = ?').get('antiraid_status');
        if (antiRaidSetting && antiRaidSetting.value === 'on') {
            const now = Date.now();
            const guildId = member.guild.id;
            
            if (!joinLog.has(guildId)) joinLog.set(guildId, []);
            const recentJoins = joinLog.get(guildId);
            
            // Keep only joins in the last 10 seconds
            const filteredJoins = recentJoins.filter(time => now - time < 10000);
            filteredJoins.push(now);
            joinLog.set(guildId, filteredJoins);

            // If more than 5 joins in 10 seconds, trigger alert
            if (filteredJoins.length > 5) {
                console.log(`[Anti-Raid] Détection de raid sur ${member.guild.name}!`);
                
                const ownerPings = OWNER_IDS.map(id => `<@${id}>`).join(' ');
                const raidEmbed = new EmbedBuilder()
                    .setTitle('🚨 ALERTE ANTI-RAID')
                    .setDescription(`Une activité de join suspecte a été détectée sur le serveur **${member.guild.name}**.\n\n**Détails:**\n- Joins récents: ${filteredJoins.length} en 10s\n- Dernier utilisateur: ${member.user.tag} (${member.id})`)
                    .setColor(0xff0000)
                    .setTimestamp();

                // Find a channel to alert or DM owners
                const alertChannel = member.guild.channels.cache.find(c => c.name.includes('admin') || c.name.includes('log') || c.name.includes('staff'));
                
                if (alertChannel) {
                    await alertChannel.send({ content: `${ownerPings}`, embeds: [raidEmbed] });
                } else {
                    // Fallback: Try to DM the first owner
                    const mainOwner = await client.users.fetch(OWNER_IDS[0]).catch(() => null);
                    if (mainOwner) await mainOwner.send({ content: `🚨 **RAID DÉTECTÉ** sur ${member.guild.name}`, embeds: [raidEmbed] });
                }
            }
        }
    } catch (err) {
        console.error('[Anti-Raid] Erreur:', err.message);
    }
});

// ============================================================
// ROLE AUTO-SYNC ON MEMBER UPDATE
// ============================================================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Check if roles actually changed
    if (oldMember.roles.cache.size !== newMember.roles.cache.size || 
        !oldMember.roles.cache.every(role => newMember.roles.cache.has(role.id))) {
        
        console.log(`[Bot] Syncing roles for ${newMember.user.tag} due to role change...`);
        const result = await syncUserRoles(newMember.id, newMember.guild);
        if (result) {
            console.log(`[Bot] ${newMember.user.tag} synced: Plan=${result.plan}, Role=${result.role}`);
        }
    }
});

// ============================================================
// STARTUP
// ============================================================
client.once('ready', () => {
    console.log(`🤖 Bot connecté en tant que ${client.user.tag}`);
    console.log(`📊 Serveurs: ${client.guilds.cache.size}`);
    
    // Check database persistence
    try {
        const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
        console.log(`📁 Base de données: ${userCount} utilisateurs trouvés (ossearch.db)`);
    } catch (e) {
        console.error('⚠️ Erreur lecture DB au démarrage:', e.message);
    }

    // Initial sync
    syncAllUsers();
    // Schedule periodic sync every 30 minutes
    setInterval(syncAllUsers, 30 * 60 * 1000);

    registerCommands();
});

client.login(TOKEN);
